/**
 * MDX içinde içe aktarmadan kullanılabilen bileşenler. .mdx dosyasında doğrudan <Callout>, <Card>, <Figure>, <Badge>,
 * <LinkButton>, <CodeBlock>, <Team> yazılabilir. Görünümler bu nesneyi <Content components={mdxComponents} /> ile verir.
 * Genişletme: yeni bileşeni src/components/ altına yazın, içe aktarıp aşağıya ekleyin (YENİ MDX BİLEŞENİ BURAYA).
 */
import Badge from '../Badge.astro'
import Callout from '../Callout.astro'
import Card from '../Card.astro'
import CodeBlock from '../CodeBlock.astro'
import Figure from '../Figure.astro'
import LinkButton from '../LinkButton.astro'
import Team from '../Team.astro'

export const mdxComponents = {
  Badge,
  Callout,
  Card,
  CodeBlock,
  Figure,
  LinkButton,
  Team,
  // YENİ MDX BİLEŞENİ BURAYA
}
