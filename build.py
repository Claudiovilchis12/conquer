"""Inline the Conquer app into one self-contained HTML page for the Claude artifact host."""
import base64, re, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
html = (src / "index.html").read_text()
css = (src / "styles.css").read_text()
icon = "data:image/svg+xml;base64," + base64.b64encode((src / "icon.svg").read_bytes()).decode()
png = "data:image/png;base64," + base64.b64encode((src / "icon-192.png").read_bytes()).decode()
html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
html = html.replace('href="icon.svg"', f'href="{icon}"').replace('href="icon-192.png"', f'href="{png}"')
html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}</style>")
for js in ("jobs.js", "logos.js", "app.js"):
    code = (src / js).read_text().replace("</script", "<\\/script")
    html = html.replace(f'<script src="{js}"></script>', f"<script>\n{code}</script>")
out.write_text(html)
print(out, len(html))
