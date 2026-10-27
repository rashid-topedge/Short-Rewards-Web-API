import os, re

base = "app/api"
results = []

for root, dirs, files in os.walk(base):
    for f in files:
        if f != "route.ts":
            continue
        path = os.path.join(root, f)
        rel = os.path.relpath(path, base)
        parts = rel.replace("route.ts", "").split(os.sep)
        endpoint = "/api/" + "/".join(p for p in parts if p)
        
        with open(path, "r", encoding="utf-8", errors="ignore") as file_obj:
            content = file_obj.read()
        methods = []
        for m in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
            if f"export async function {m}" in content:
                methods.append(m)
        
        fields = []
        for m in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
            # find body variable usage in this method block (rough)
            pass
        # extract all body. references
        matches = re.findall(r'body\.([a-zA-Z_][a-zA-Z0-9_]*)', content)
        unique = list(dict.fromkeys(matches))
        
        # also body? refs
        matches2 = re.findall(r'body\?\.([a-zA-Z_][a-zA-Z0-9_]*)', content)
        for m in matches2:
            if m not in unique:
                unique.append(m)
        
        query_params = re.findall(r'searchParams\.get\("([^"]+)"\)', content)
        
        results.append({
            "endpoint": endpoint,
            "methods": methods,
            "file": rel,
            "fields": unique,
            "query_params": list(dict.fromkeys(query_params))
        })

results.sort(key=lambda x: x["endpoint"])

with open("API_TEST_DOC.md", "w", encoding="utf-8") as out:
    out.write("# API Endpoint Interactive Test Doc\n\n")
    out.write("Like Flask `flasgger` docs — list all endpoints with test payloads and curl commands you can copy-paste.\n\n")
    for r in results:
        out.write(f"---\n\n## `{r['endpoint']}`  \n")
        out.write(f"- **File:** `app/api/{r['file']}`  \n")
        out.write(f"- **Methods:** {', '.join(r['methods']) if r['methods'] else 'NONE FOUND'}  \n")
        if r['query_params']:
            out.write(f"- **Query Params:** {', '.join(r['query_params'])}  \n")
        out.write(f"- **Body Fields:** {', '.join(r['fields']) if r['fields'] else '(none found)'}  \n")
        
        payload = {}
        for f in r['fields']:
            if f in ("title", "name"):
                payload[f] = "Test Title"
            elif f == "slug":
                payload[f] = "test-slug"
            elif f == "cover" or f == "image" or f == "url":
                payload[f] = "https://example.com/img.jpg"
            elif f == "synopsis" or f == "description" or f == "bio":
                payload[f] = "Test description here."
            elif f == "tags" or f == "tag":
                payload[f] = ["drama", "test"]
            elif f in ("isPublished", "published", "isActive", "isPublic"):
                payload[f] = True
            elif f in ("episodeCount", "playCount", "likeCount", "count", "amount"):
                payload[f] = 1
            elif f == "latestEpisodeLabel":
                payload[f] = "Ep 1"
            elif f in ("userId", "dramaId", "reelId", "id"):
                payload[f] = "test-id-123"
            else:
                payload[f] = "test-value"
        
        out.write("\n### Example Request Body (JSON):\n```json\n")
        import json
        out.write(json.dumps(payload, indent=2))
        out.write("\n```\n")
        
        out.write("\n### Curl Examples:\n")
        for m in r['methods']:
            base_url = f"http://localhost:3000{r['endpoint']}"
            cmd = f"curl -X {m} "
            if m in ("POST", "PUT", "PATCH") and payload:
                cmd += f"-H 'Content-Type: application/json' -d '{json.dumps(payload)}' "
            if r['query_params']:
                qp_str = "?" + "&".join([f"{p}=test" for p in r['query_params']])
                cmd += f"'{base_url}{qp_str}'"
            else:
                cmd += f"'{base_url}'"
            out.write(f"```bash\n{cmd}\n```\n")

print(f"Done. Wrote {len(results)} endpoints to API_TEST_DOC.md")
