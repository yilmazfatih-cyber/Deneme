/*
 * kabuk.c — kullanıcı alanı ile çekirdek arasındaki sistem çağrısı sınırını
 * gösteren küçük bir Unix kabuğu.
 *
 * Desteklenenler: boru hattı (a | b | c), yönlendirme (< > >>), tek/çift
 * tırnak, ters bölü kaçışı, $? ve $AD genişletmesi, # yorum, yerleşik
 * komutlar cd ve exit, -c "komut" kipi.
 *
 * Her satır için akış: jetonla → ayrıştır → çalıştır.
 * Çalıştırmanın kalbi şu sistem çağrılarıdır (Linux'taki tanımları):
 *   pipe2  fs/pipe.c        fork/clone  kernel/fork.c
 *   dup2   fs/file.c        execve      fs/exec.c
 *   open   fs/open.c        wait4       kernel/exit.c
 *   chdir  fs/open.c
 * İzlemek için: strace -f -e trace=pipe2,clone,dup2,execve,wait4 ./kabuk -c 'ls | wc -l'
 */
#define _GNU_SOURCE /* pipe2() bir GNU/Linux eklentisidir */
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define AZAMI_SATIR 4096
#define AZAMI_JETON 256
#define AZAMI_ARG 64
#define AZAMI_KOMUT 16
#define DEPO_BOYU (AZAMI_SATIR * 4)

enum jeton_turu { KELIME, BORU, GIRDI, CIKTI, EKLE };

struct jeton {
    enum jeton_turu tur;
    char *metin;
};

struct komut {
    char *argv[AZAMI_ARG + 1]; /* execvp NULL ile biten dizi ister */
    int argc;
    const char *girdi;  /* < dosya */
    const char *cikti;  /* > ya da >> dosya */
    int ekle;           /* >> mı? */
};

static int son_durum;             /* $? */
static char depo[DEPO_BOYU];      /* bir satırın jeton metinleri */
static size_t depo_n;
static int depo_tasti;

/* ---------------- 1. Jetonlama ---------------- */

static void depoya(char c)
{
    if (depo_n + 1 >= DEPO_BOYU) {
        depo_tasti = 1;
        return;
    }
    depo[depo_n++] = c;
}

static void dizgi_depoya(const char *s)
{
    while (*s)
        depoya(*s++);
}

/* *s '$' üzerindeyken çağrılır: $? ya da $AD genişletir, *s'yi ilerletir. */
static void genislet(const char **s)
{
    const char *p = *s + 1;
    if (*p == '?') {
        char sayi[16];
        snprintf(sayi, sizeof sayi, "%d", son_durum);
        dizgi_depoya(sayi);
        *s = p + 1;
        return;
    }
    if (!(*p == '_' || (*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z'))) {
        depoya('$'); /* tek başına $ olduğu gibi kalır */
        *s = p;
        return;
    }
    char ad[128];
    size_t n = 0;
    while ((*p == '_' || (*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z') || (*p >= '0' && *p <= '9')) &&
           n + 1 < sizeof ad)
        ad[n++] = *p++;
    ad[n] = '\0';
    const char *deger = getenv(ad);
    if (deger)
        dizgi_depoya(deger);
    *s = p;
}

/* Satırı jetonlara böler. Hata durumunda -1 döner ve mesaj yazar. */
static int jetonla(const char *s, struct jeton *j)
{
    int n = 0;
    depo_n = 0;
    depo_tasti = 0;
    for (;;) {
        while (*s == ' ' || *s == '\t' || *s == '\n')
            s++;
        if (*s == '\0' || *s == '#') /* # yalnız kelime başında yorum açar */
            break;
        if (n == AZAMI_JETON) {
            fprintf(stderr, "kabuk: satırda çok fazla jeton\n");
            return -1;
        }
        if (*s == '|') {
            j[n++] = (struct jeton){BORU, NULL};
            s++;
            continue;
        }
        if (*s == '<') {
            j[n++] = (struct jeton){GIRDI, NULL};
            s++;
            continue;
        }
        if (*s == '>') {
            int cift = s[1] == '>';
            j[n++] = (struct jeton){cift ? EKLE : CIKTI, NULL};
            s += cift ? 2 : 1;
            continue;
        }
        char *bas = &depo[depo_n];
        while (*s && !strchr(" \t\n|<>", *s)) {
            if (*s == '\'') { /* tek tırnak: her şey harfiyen */
                s++;
                while (*s && *s != '\'')
                    depoya(*s++);
                if (*s != '\'') {
                    fprintf(stderr, "kabuk: kapanmamış tek tırnak\n");
                    return -1;
                }
                s++;
            } else if (*s == '"') { /* çift tırnak: yalnız $ ve \ özel */
                s++;
                while (*s && *s != '"') {
                    if (*s == '\\' && (s[1] == '"' || s[1] == '\\' || s[1] == '$')) {
                        depoya(s[1]);
                        s += 2;
                    } else if (*s == '$') {
                        genislet(&s);
                    } else {
                        depoya(*s++);
                    }
                }
                if (*s != '"') {
                    fprintf(stderr, "kabuk: kapanmamış çift tırnak\n");
                    return -1;
                }
                s++;
            } else if (*s == '\\' && s[1]) {
                depoya(s[1]);
                s += 2;
            } else if (*s == '$') {
                genislet(&s);
            } else {
                depoya(*s++);
            }
        }
        depoya('\0');
        if (depo_tasti) {
            fprintf(stderr, "kabuk: satır çok uzun\n");
            return -1;
        }
        j[n++] = (struct jeton){KELIME, bas};
    }
    return n;
}

/* ---------------- 2. Ayrıştırma ---------------- */

static int sozdizimi_hatasi(const char *yakininda)
{
    fprintf(stderr, "kabuk: sözdizimi hatası: '%s' yakınında\n", yakininda);
    return -1;
}

/* Jetonlardan boru hattı kurar; komut sayısını döner (boş satır: 0). */
static int ayristir(const struct jeton *j, int n, struct komut *k)
{
    int c = 0;
    memset(&k[0], 0, sizeof k[0]);
    for (int i = 0; i < n; i++) {
        switch (j[i].tur) {
        case KELIME:
            if (k[c].argc == AZAMI_ARG) {
                fprintf(stderr, "kabuk: çok fazla argüman\n");
                return -1;
            }
            k[c].argv[k[c].argc++] = j[i].metin;
            break;
        case BORU:
            if (k[c].argc == 0)
                return sozdizimi_hatasi("|");
            if (++c == AZAMI_KOMUT) {
                fprintf(stderr, "kabuk: boru hattı çok uzun\n");
                return -1;
            }
            memset(&k[c], 0, sizeof k[c]);
            break;
        case GIRDI:
        case CIKTI:
        case EKLE:
            if (i + 1 >= n || j[i + 1].tur != KELIME)
                return sozdizimi_hatasi(j[i].tur == GIRDI ? "<" : j[i].tur == EKLE ? ">>" : ">");
            if (j[i].tur == GIRDI) {
                k[c].girdi = j[i + 1].metin;
            } else {
                k[c].cikti = j[i + 1].metin;
                k[c].ekle = j[i].tur == EKLE;
            }
            i++;
            break;
        }
    }
    if (k[c].argc == 0) {
        if (c == 0 && !k[0].girdi && !k[0].cikti)
            return 0; /* boş satır ya da yalnız yorum */
        return sozdizimi_hatasi(c > 0 ? "|" : "yeni satır");
    }
    return c + 1;
}

/* ---------------- 3. Çalıştırma ---------------- */

static int yerlesik_mi(const char *ad)
{
    return strcmp(ad, "cd") == 0 || strcmp(ad, "exit") == 0;
}

/* Yerleşik komutlar kabuğun KENDİ sürecinde çalışmalıdır: çocukta chdir()
 * yapmak yalnız çocuğun dizinini değiştirir, kabuğunkini değil. */
static int yerlesik_calistir(const struct komut *k)
{
    if (strcmp(k->argv[0], "exit") == 0) {
        int kod = k->argc > 1 ? atoi(k->argv[1]) : son_durum;
        fflush(NULL);
        exit(kod & 0xFF);
    }
    const char *hedef = k->argc > 1 ? k->argv[1] : getenv("HOME");
    if (!hedef) {
        fprintf(stderr, "kabuk: cd: HOME tanımsız\n");
        return 1;
    }
    if (chdir(hedef) != 0) {
        fprintf(stderr, "kabuk: cd: %s: %s\n", hedef, strerror(errno));
        return 1;
    }
    return 0;
}

/* Çocuk süreçte: < > >> yönlendirmelerini dosya tanıtıcısı 0/1'e bağlar. */
static int yonlendir(const struct komut *k)
{
    if (k->girdi) {
        int fd = open(k->girdi, O_RDONLY | O_CLOEXEC);
        if (fd < 0) {
            fprintf(stderr, "kabuk: %s: %s\n", k->girdi, strerror(errno));
            return -1;
        }
        dup2(fd, STDIN_FILENO); /* dup2'nin kopyası O_CLOEXEC taşımaz */
        close(fd);
    }
    if (k->cikti) {
        int bayrak = O_WRONLY | O_CREAT | O_CLOEXEC | (k->ekle ? O_APPEND : O_TRUNC);
        int fd = open(k->cikti, bayrak, 0644);
        if (fd < 0) {
            fprintf(stderr, "kabuk: %s: %s\n", k->cikti, strerror(errno));
            return -1;
        }
        dup2(fd, STDOUT_FILENO);
        close(fd);
    }
    return 0;
}

static int durum_kodu(int durum)
{
    if (WIFEXITED(durum))
        return WEXITSTATUS(durum);
    if (WIFSIGNALED(durum))
        return 128 + WTERMSIG(durum); /* bash ile aynı kural */
    return 1;
}

/* Boru hattı yarıda kalırsa (pipe2 ya da fork hatası): kabukta açık kalan boru
 * uçlarını kapat, önceden çatallanan çocukları bekle. Okuma ucu kapanınca o
 * boruya yazan çocuk SIGPIPE ile ölür; bu yüzden bekleme takılmaz. Kapatmasak
 * hem tanıtıcı sızar hem de yazan çocuk dolu boruda sonsuza dek bekler. */
static int yarida_kes(int onceki_okuma, const int boru[2], const pid_t *pidler, int baslatilan)
{
    if (onceki_okuma != -1)
        close(onceki_okuma);
    if (boru[0] != -1)
        close(boru[0]);
    if (boru[1] != -1)
        close(boru[1]);
    for (int j = 0; j < baslatilan; j++)
        while (waitpid(pidler[j], NULL, 0) < 0 && errno == EINTR)
            ;
    return 1;
}

static int calistir(struct komut *k, int n)
{
    if (n == 1 && yerlesik_mi(k[0].argv[0]))
        return yerlesik_calistir(&k[0]);

    pid_t pidler[AZAMI_KOMUT];
    int onceki_okuma = -1; /* önceki borunun okuma ucu = bu komutun stdin'i */
    fflush(NULL);          /* çatallamadan önce stdio tamponlarını boşalt */

    for (int i = 0; i < n; i++) {
        int boru[2] = {-1, -1};
        /* O_CLOEXEC: exec edilen programlar ilgisiz boru uçlarını devralmasın. */
        if (i < n - 1 && pipe2(boru, O_CLOEXEC) != 0) {
            perror("kabuk: pipe2"); /* başarısız pipe2 diziyi değiştirmez: {-1, -1} */
            return yarida_kes(onceki_okuma, boru, pidler, i);
        }
        pid_t pid = fork();
        if (pid < 0) {
            perror("kabuk: fork");
            return yarida_kes(onceki_okuma, boru, pidler, i);
        }
        if (pid == 0) { /* ---- çocuk ---- */
            signal(SIGINT, SIG_DFL);
            if (onceki_okuma != -1) {
                dup2(onceki_okuma, STDIN_FILENO);
                close(onceki_okuma);
            }
            if (i < n - 1) {
                close(boru[0]);
                dup2(boru[1], STDOUT_FILENO);
                close(boru[1]);
            }
            if (yonlendir(&k[i]) != 0)
                _exit(1);
            if (yerlesik_mi(k[i].argv[0])) /* boru içinde yerleşik: alt kabukta çalışır */
                _exit(yerlesik_calistir(&k[i]));
            k[i].argv[k[i].argc] = NULL;
            execvp(k[i].argv[0], k[i].argv);
            /* execvp yalnız hata olursa döner */
            int kod = errno == ENOENT ? 127 : 126;
            if (errno == ENOENT)
                fprintf(stderr, "kabuk: %s: komut bulunamadı\n", k[i].argv[0]);
            else
                fprintf(stderr, "kabuk: %s: %s\n", k[i].argv[0], strerror(errno));
            _exit(kod);
        }
        /* ---- ebeveyn ---- */
        pidler[i] = pid;
        if (onceki_okuma != -1)
            close(onceki_okuma);
        if (i < n - 1) {
            close(boru[1]); /* yazma ucunu kapatmazsak okuyucu hiç EOF görmez */
            onceki_okuma = boru[0];
        }
    }

    int sonuc = 0;
    for (int i = 0; i < n; i++) {
        int durum;
        while (waitpid(pidler[i], &durum, 0) < 0) {
            if (errno != EINTR) {
                perror("kabuk: waitpid");
                return 1;
            }
        }
        if (i == n - 1)
            sonuc = durum_kodu(durum); /* boru hattının durumu = son komutunki */
    }
    return sonuc;
}

static void satir_isle(const char *satir)
{
    struct jeton jetonlar[AZAMI_JETON];
    struct komut komutlar[AZAMI_KOMUT];
    int nj = jetonla(satir, jetonlar);
    if (nj < 0) {
        son_durum = 2;
        return;
    }
    int nk = ayristir(jetonlar, nj, komutlar);
    if (nk < 0) {
        son_durum = 2;
        return;
    }
    if (nk > 0)
        son_durum = calistir(komutlar, nk);
}

int main(int argc, char **argv)
{
    if (argc == 3 && strcmp(argv[1], "-c") == 0) {
        satir_isle(argv[2]);
        return son_durum;
    }
    if (argc != 1) {
        fprintf(stderr, "kullanım: kabuk [-c komut]\n");
        return 2;
    }
    int etkilesimli = isatty(STDIN_FILENO);
    if (etkilesimli)
        signal(SIGINT, SIG_IGN); /* Ctrl-C ön plandaki çocuğu öldürsün, kabuğu değil */

    char *satir = NULL;
    size_t kapasite = 0;
    for (;;) {
        if (etkilesimli) {
            fprintf(stderr, "kabuk$ ");
            fflush(stderr);
        }
        ssize_t uzunluk = getline(&satir, &kapasite, stdin);
        if (uzunluk < 0)
            break; /* EOF (Ctrl-D) */
        if (uzunluk > AZAMI_SATIR) {
            fprintf(stderr, "kabuk: satır çok uzun\n");
            son_durum = 2;
            continue;
        }
        satir_isle(satir);
    }
    free(satir);
    return son_durum;
}
