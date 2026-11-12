// miniollama komut satırı: serve, create, list, registry.
//
// Gerçek karşılığı: main.go -> cmd/cmd.go (cobra ile NewCLI; "ollama serve", "ollama run", "ollama create"...).
// Gerçekte create/list/run komutları da sunucuya HTTP ile bağlanır; burada create ve list doğrudan
// model deposunu kullanır.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"text/tabwriter"
	"time"

	"miniollama/modelfile"
	"miniollama/sched"
	"miniollama/server"
	"miniollama/store"
)

func modelsDir() string {
	if d := os.Getenv("MINIOLLAMA_MODELS"); d != "" { // gerçekte OLLAMA_MODELS
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".miniollama", "models")
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "kullanım: miniollama serve|create|list|registry [bayraklar]")
		os.Exit(2)
	}
	fs := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	models := fs.String("models", modelsDir(), "model deposu klasörü")
	addr := fs.String("addr", "127.0.0.1:11435", "dinlenecek adres (gerçek Ollama: 127.0.0.1:11434)")
	registry := fs.String("registry", "", "pull için kayıt defteri adresi, ör. http://127.0.0.1:5005")
	keepAlive := fs.Duration("keep-alive", 5*time.Minute, "varsayılan keep_alive")
	maxLoaded := fs.Int("max-loaded", 2, "aynı anda yüklü en fazla model")
	file := fs.String("f", "Modelfile", "create için Modelfile yolu")
	fs.Parse(os.Args[2:])

	st, err := store.New(*models)
	if err != nil {
		log.Fatal(err)
	}
	switch os.Args[1] {
	case "serve":
		s := &server.Server{Store: st, Sched: sched.New(server.MarkovLoader(6), *maxLoaded, *keepAlive), RegistryURL: *registry}
		log.Printf("miniollama %s adresinde, depo: %s", *addr, *models)
		log.Fatal(http.ListenAndServe(*addr, s.Handler()))
	case "registry":
		log.Printf("kayıt defteri %s adresinde, depo: %s", *addr, *models)
		log.Fatal(http.ListenAndServe(*addr, store.RegistryHandler(st)))
	case "create":
		if fs.NArg() != 1 {
			log.Fatal("kullanım: miniollama create [-f Modelfile] AD")
		}
		f, err := os.Open(*file)
		if err != nil {
			log.Fatal(err)
		}
		defer f.Close()
		mf, err := modelfile.Parse(f)
		if err != nil {
			log.Fatal(err)
		}
		n, err := st.Create(fs.Arg(0), mf, filepath.Dir(*file))
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println("oluşturuldu:", n.Short())
	case "list":
		entries, err := st.List()
		if err != nil {
			log.Fatal(err)
		}
		tw := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
		fmt.Fprintln(tw, "AD\tÖZET\tDEĞİŞTİRİLME")
		for _, e := range entries {
			fmt.Fprintf(tw, "%s\t%s\t%s\n", e.Name.Short(), e.Digest[:12], e.ModTime.Format(time.DateTime))
		}
		tw.Flush()
	default:
		log.Fatalf("bilinmeyen komut %q", os.Args[1])
	}
}
