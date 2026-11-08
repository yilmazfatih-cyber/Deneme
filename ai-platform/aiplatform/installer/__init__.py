"""Tek tık kurulum: model indirme, Python ekleri, LLM motoru, iş kuyruğu.

Alt modüller doğrudan içe aktarılır (`from aiplatform.installer import installer, jobs, engine`);
burada ağır içe aktarma yapılmaz ki `aiplatform.db.init_db` yalnız tabloları (`installer.models`) yükleyebilsin.
"""
