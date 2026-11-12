import unittest

from url_shortener import (
    CollisionError,
    CounterShortener,
    HashShortener,
    InMemoryStore,
    base62_decode,
    base62_encode,
)


class Base62Test(unittest.TestCase):
    def test_round_trip(self) -> None:
        for number in [0, 1, 61, 62, 12345, 62**7 - 1, 2**64]:
            with self.subTest(number=number):
                self.assertEqual(base62_decode(base62_encode(number)), number)
        self.assertEqual(len(base62_encode(62**7 - 1)), 7)
        self.assertEqual(62**7, 3_521_614_606_208)


class HashShortenerTest(unittest.TestCase):
    def test_same_url_same_code_and_resolve(self) -> None:
        shortener = HashShortener(InMemoryStore())
        code = shortener.shorten("https://ornek.com.tr/kampanya?id=7")
        self.assertEqual(len(code), 7)
        self.assertEqual(shortener.shorten("HTTPS://ORNEK.com.tr/kampanya?id=7"), code)
        self.assertEqual(shortener.resolve(code), "https://ornek.com.tr/kampanya?id=7")
        with self.assertRaises(KeyError):
            shortener.resolve("yok0000")

    def test_collision_is_resolved_with_next_attempt(self) -> None:
        # İlk denemede her URL'ye aynı hash'i veren bir fonksiyonla çakışmayı zorluyoruz.
        def weak_hash(text: str) -> int:
            url, attempt = text.rsplit("#", 1)
            return 42 if attempt == "0" else hash(url) % 10**9 + int(attempt)

        store = InMemoryStore()
        shortener = HashShortener(store, length=4, hash_fn=weak_hash)
        first = shortener.shorten("https://a.example/1")
        second = shortener.shorten("https://a.example/2")
        self.assertNotEqual(first, second)
        self.assertEqual(shortener.collisions, 1)
        self.assertEqual(shortener.resolve(second), "https://a.example/2")
        self.assertEqual(len(store), 2)

    def test_gives_up_after_max_attempts(self) -> None:
        shortener = HashShortener(InMemoryStore(), length=3, max_attempts=3, hash_fn=lambda _text: 7)
        shortener.shorten("https://a.example/1")
        with self.assertRaises(CollisionError):
            shortener.shorten("https://a.example/2")

    def test_rejects_unsafe_urls(self) -> None:
        shortener = HashShortener(InMemoryStore())
        for url in ["javascript:alert(1)", "ftp://dosya.example/x", "ornek.com", "data:text/html,hi"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                shortener.shorten(url)


class CounterShortenerTest(unittest.TestCase):
    def test_sequential_and_guessable(self) -> None:
        shortener = CounterShortener(InMemoryStore(), start=61)
        codes = [shortener.shorten(f"https://ornek.com/{i}") for i in range(3)]
        self.assertEqual(codes, ["Z", "10", "11"])
        self.assertEqual(shortener.resolve("10"), "https://ornek.com/1")

    def test_overlapping_ranges_are_detected(self) -> None:
        store = InMemoryStore()
        CounterShortener(store, start=1000).shorten("https://a.example/")
        with self.assertRaises(CollisionError):
            CounterShortener(store, start=1000).shorten("https://b.example/")


if __name__ == "__main__":
    unittest.main()
