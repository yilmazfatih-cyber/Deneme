<!-- prettier-ignore-start -->
# Ornek Public APIs

Bu dosya public-apis README bicimini taklit eden KURGUSAL bir ornektir.
Butun alan adlari RFC 2606 ile ayrilmis example.* alanlaridir.

### Sponsor APIs

- [Sponsor One](https://sponsor.example.com/)

## Sponsor Table
| API | Description | Call this API |
|:---|:---|:---|
| [Sponsor One](https://sponsor.example.com/one) | A paid service with a free tier. | [Docs](https://sponsor.example.com/docs) |

## MCP Servers

| Name | Description | Auth | Transport | Install |
|:---|:---|:---|:---|:---|
| [Files MCP](https://mcp.example.org/files) | Read local files from an agent | No | `stdio` | - |

## Index

* [Animals](#animals)
* [Books](#books)
* [Weather](#weather)

### Animals
API | Description | Auth | HTTPS | CORS |
|---|---|---|---|---|
| [Axolotl Facts](https://axolotl.example.com/) | Facts and pictures about axolotls | No | Yes | Yes |
| [Cat Facts](https://cats.example.com/docs) | Random cat facts | No | Yes | Unknown |
| [Dog Breeds](https://dogs.example.org/api) | Dog breeds with pictures | `apiKey` | Yes | No |

**[Back to Index](#index)**

### Books
| API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Library Catalog](https://library.example.net/v1) | Search a public library catalog | `OAuth` | Yes | Yes | |
| [Poetry Archive](https://poetry.example.com/) | Classic poems by author and title | No | Yes | Yes |
| [Quotes Store](https://quotes.example.org/) | Quotes from books (OpenAPI docs) | `X-Mashape-Key` | No | No |

**[Back to Index](#index)**

### Weather
API | Description | Auth | HTTPS | CORS |
|---|---|---|---|---|
| [Air Quality](https://air.example.com/) | Hourly air quality index by city | `apiKey` | Yes | Yes |
| [Rain Radar](https://rain.example.net/radar) | Radar images for the last hour | `User-Agent` | Yes | Unknown |
| [Sun Times](https://sun.example.org/) | Sunrise and sunset times for any location | No | Yes | Yes |

**[Back to Index](#index)**

## License
MIT (c) ornek
<!-- prettier-ignore-end -->
