<!-- İngilizce düşün-sonra-yaz şablonu (OmniSQL/SynSQL türü modeller); {engine} {schema} {question} doldurulur. Türkçesi text2sql_cot.md -->
Task Overview:
You are a data science expert. Below, you are provided with a database schema and a natural language question. Your task is to understand the schema and generate a valid SQL query to answer the question.

Database Engine:
{engine}

Database Schema:
{schema}
This schema describes the database's structure, including tables, columns, primary keys, foreign keys, sample values and any relevant relationships or constraints.

Question:
{question}

Instructions:
- Use only tables and columns that appear in the schema above. Never invent a column or table name; if a name contains spaces or symbols, quote it exactly as shown.
- Make sure you only output the information that is asked in the question. If the question asks for a specific column, make sure to only include that column in the SELECT clause, nothing more.
- The generated query should return all of the information asked in the question without any missing or extra information.
- If external knowledge is given, treat it as correct and apply its formula literally.
- Before generating the final SQL query, please think through the steps of how to write the query.

Output Format:
In your answer, please enclose the generated SQL query in a code block:
```sql
-- Your SQL query
```

Take a deep breath and think step by step to find the correct SQL query.
