import json
import re

with open('data.json') as f:
    data = json.load(f)

with open('model.js') as f:
    model_js = f.read()

# strip the require line and self-test block, we'll inline DATA instead
model_js = model_js.replace("const DATA = require('./data.json');", "// DATA injected below")
model_js = model_js.split("// ---- self-test")[0]
# Rimozione ROBUSTA del blocco module.exports = { ... }; (regex, non stringa fissa):
# una stringa fissa qui si disallinea silenziosamente ogni volta che si aggiunge/toglie
# un nome esportato in model.js, lasciando "module.exports" nell'HTML finale -> nel
# browser genera "ReferenceError: module is not defined" che blocca TUTTO lo script.
model_js = re.sub(r"module\.exports\s*=\s*\{.*?\};\n?", "", model_js, flags=re.S)
if 'module.exports' in model_js:
    raise RuntimeError('module.exports non rimosso correttamente da model.js: controllare la regex')

with open('app.js') as f:
    app_js = f.read()

data_json_str = json.dumps(data)

app_bundle = "const DATA = " + data_json_str + ";\n\n" + model_js + "\n\n" + app_js

# Scrive anche extracted.js: stesso identico bundle usato nell'HTML finale, così i test
# (node --check, dom_stub_test.js) verificano SEMPRE il codice realmente pubblicato,
# invece di una copia duplicata e potenzialmente disallineata.
with open('extracted.js', 'w') as f:
    f.write(app_bundle)

with open('plotly.min.js') as f:
    plotly_js = f.read()

with open('template.html') as f:
    template = f.read()

html = (template
        .replace('__PLOTLY_JS__', plotly_js)
        .replace('__APP_JS__', app_bundle))

with open('/sessions/wonderful-sweet-pascal/mnt/outputs/eSAF_Modello_Interattivo.html', 'w') as f:
    f.write(html)

print('done', len(html))
