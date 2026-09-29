import re, sys, html as H

CSS = '''
  .costs td{font-size:14.5px;}
  .costs td.amt{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;}
  .costs .who2{color:var(--ink3);font-size:13px;}
  .fine{font-size:13px;color:var(--ink2);margin-top:10px;}
  .done{display:inline-flex;align-items:center;gap:8px;font-family:var(--display);letter-spacing:.06em;font-size:13px;color:var(--ink2);cursor:pointer;user-select:none;padding:4px 2px;}
  .done input{width:24px;height:24px;accent-color:var(--ok);margin:0;cursor:pointer;}
  .task.is-done{opacity:.55;}
  .task.is-done h4{text-decoration:line-through;}
  .progress{font-family:var(--display);letter-spacing:.08em;font-size:13px;color:var(--ok);margin-top:10px;}
  .form{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px 17px;margin-top:12px;display:grid;gap:14px;}
  .form label.q{display:grid;gap:5px;font-size:14.5px;color:var(--ink);font-weight:600;}
  .form .hint{font-weight:400;color:var(--ink3);font-size:13px;}
  .form input[type=text],.form input[type=email],.form input[type=tel],.form select,.form textarea{font:inherit;font-weight:400;font-size:16px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:10px 11px;width:100%;}
  .form textarea{min-height:76px;resize:vertical;}
  .choice{display:flex;gap:16px;flex-wrap:wrap;font-weight:400;}
  .choice label{display:inline-flex;align-items:center;gap:7px;cursor:pointer;}
  .choice input{width:20px;height:20px;accent-color:var(--ok);margin:0;}
  .send{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:4px;}
  .send button{font-family:var(--display);letter-spacing:.06em;font-size:16px;background:var(--ok);color:#fff;border:0;border-radius:6px;padding:12px 18px;cursor:pointer;}
  .send .ok{color:var(--ok);font-weight:700;font-size:14px;}
  #answersOut{display:none;width:100%;min-height:160px;font-family:var(--mono);font-size:13px;}
'''

SCRIPT = r'''
<script>
(function(){
  var KEY = '__KEY__';
  var load = function(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ return {}; } };
  var save = function(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); } catch(e){} };
  var state = load(); state.jobs = state.jobs || {}; state.answers = state.answers || {};

  var boxes = document.querySelectorAll('input[data-job]');
  var progress = document.getElementById('progress');
  function paint(){
    var n = 0;
    boxes.forEach(function(b){
      var on = !!state.jobs[b.dataset.job]; b.checked = on; if (on) n++;
      var t = b.closest('.task'); if (t) t.classList.toggle('is-done', on);
    });
    if (progress) progress.textContent = n + ' OF ' + boxes.length + ' DONE';
  }
  boxes.forEach(function(b){ b.addEventListener('change', function(){ state.jobs[b.dataset.job] = b.checked; save(state); paint(); }); });
  paint();

  var fields = document.querySelectorAll('[data-q]');
  fields.forEach(function(f){
    var k = f.dataset.q, v = state.answers[k];
    if (f.type === 'radio') f.checked = (v === f.value); else if (v !== undefined) f.value = v;
    f.addEventListener(f.type === 'radio' || f.tagName === 'SELECT' ? 'change' : 'input', function(){
      state.answers[k] = f.value; save(state);
    });
  });

  var btn = document.getElementById('copyAnswers'), out = document.getElementById('answersOut'), ok = document.getElementById('copied');
  if (btn) btn.addEventListener('click', function(){
    var lines = ['__TITLE__', ''];
    document.querySelectorAll('.form label.q').forEach(function(l){
      var q = l.querySelector('.qt').textContent.trim(), v = '';
      var radio = l.querySelector('input[type=radio]:checked');
      var other = l.querySelector('input[type=text],input[type=email],input[type=tel],select,textarea');
      if (radio) v = radio.value;
      if (other && other.value.trim()) v = v ? v + ' — ' + other.value.trim() : other.value.trim();
      lines.push(q + ': ' + (v || '—'));
    });
    var done = []; boxes.forEach(function(b){ if (b.checked) done.push(b.closest('.task').querySelector('h4').textContent.trim()); });
    lines.push('', 'Done so far: ' + (done.length ? done.join('; ') : 'nothing yet'));
    var text = lines.join('\n');
    out.value = text; out.style.display = 'block';
    var shown = function(msg){ ok.textContent = msg; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){ shown('Copied — paste it into a text or email to us.'); },
        function(){ out.select(); shown('Select all below and copy it.'); });
    } else { out.select(); shown('Select all below and copy it.'); }
  });
})();
</script>
'''

def q(label, key, kind='text', hint='', options=None, other=False, placeholder=''):
    h = f'<span class="hint">{hint}</span>' if hint else ''
    if kind == 'radio':
        inner = '<span class="choice">' + ''.join(f'<label><input type="radio" name="{key}" data-q="{key}" value="{H.escape(o)}"> {H.escape(o)}</label>' for o in options) + '</span>'
        if other:
            inner += f'<input type="text" data-q="{key}_other" placeholder="{H.escape(placeholder)}">'
    elif kind == 'select':
        inner = f'<select data-q="{key}"><option value=""></option>' + ''.join(f'<option>{H.escape(o)}</option>' for o in options) + '</select>'
    elif kind == 'area':
        inner = f'<textarea data-q="{key}" placeholder="{H.escape(placeholder)}"></textarea>'
    else:
        inner = f'<input type="{kind}" data-q="{key}" placeholder="{H.escape(placeholder)}">'
    return f'    <label class="q"><span class="qt">{label}</span>{h}{inner}</label>\n'

def transform(t, costs_rows, costs_fine, questions, send_to, storage_key, title):
    t = t.replace('</style>', CSS + '</style>', 1)
    # every job gets a tick box instead of the YOU tag
    n = [0]
    def tick(m):
        n[0] += 1
        return f'<label class="done"><input type="checkbox" data-job="{m.group(1)}"> DONE</label>'
    t = re.sub(r'<span class="num">(\d+)</span>(<h4>.*?</h4>)<span class="who you">YOU</span>',
               lambda m: f'<span class="num">{m.group(1)}</span>{m.group(2)}<label class="done"><input type="checkbox" data-job="{m.group(1)}"> DONE</label>', t)
    # costs, straight after the email box at the top
    costs = ('\n  <h2 class="band"><span>WHAT IT COSTS YOU</span><span class="sub">NOTHING ELSE, EVER</span></h2>\n'
             '  <div class="scroll"><table class="costs"><thead><tr><th>What</th><th class="r">Cost</th></tr></thead><tbody>\n'
             + ''.join(f'    <tr><td>{a}<br><span class="who2">Paid to: {c}</span></td><td class="r amt">{b}</td></tr>\n' for a, b, c in costs_rows)
             + '  </tbody></table></div>\n'
             + f'  <p class="fine">{costs_fine}</p>\n'
             + '  <p class="progress" id="progress"></p>\n')
    anchor = '<!-- ============ TODAY ============ -->'
    assert t.count(anchor) == 1
    t = t.replace(anchor, costs + '\n  ' + anchor)
    # the reply: a form instead of the email to copy
    m = re.search(r'  <h2 class="band"><span>THE EMAIL</span>.*?</div>\n', t, flags=re.S)
    assert m, 'no email block'
    form = ('  <h2 class="band"><span>YOUR ANSWERS</span><span class="sub">FILL IN WHAT YOU CAN — IT SAVES AS YOU GO</span></h2>\n'
            '  <div class="form">\n' + ''.join(questions) +
            '    <div class="send"><button type="button" id="copyAnswers">COPY MY ANSWERS</button><span class="ok" id="copied"></span></div>\n'
            f'    <p class="fine" style="margin:0">Then paste into a text or email to <b class="email">{send_to}</b>.</p>\n'
            '    <textarea id="answersOut" readonly></textarea>\n  </div>\n')
    t = t.replace(m.group(0), form)
    t = t.rstrip() + '\n' + SCRIPT.replace('__KEY__', storage_key).replace('__TITLE__', title) + '\n'
    return t, n
