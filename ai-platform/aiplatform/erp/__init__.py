"""ERP entegrasyonu: salt-okunur SQL ve REST bağlayıcıları, örnek (mock) ERP, insan onayı kuyruğu, webhook.

Ana giriş noktaları:
  connector.get_connector(id)           → ERPConnector (list_tools / call_tool / read_only)
  connector.get_schema_summary(id)      → Text2SQL istemine giren DDL + maskeli örnek satırlar
  connector.run_readonly(id, sql)       → {"columns", "rows", "row_count", "truncated"}
  approvals.create_approval(...) / decide(...)
  tools.all_tools()                     → iş akışı ajanının OpenAI function şemaları

UYARI: Örnek ERP dışındaki bütün bağlantılar ERP'de YALNIZ SALT-OKUNUR yetkili bir veritabanı kullanıcısıyla
tanımlanmalıdır. Platformdaki SQL denetimi ikinci savunma hattıdır, tek başına yeterli değildir.
"""

READONLY_WARNING = (
    "Bu bağlantı ERP veritabanında yalnız SELECT yetkisi olan, salt-okunur bir kullanıcıyla tanımlanmalıdır. "
    "Platformun SQL denetimi ikinci savunma hattıdır."
)
