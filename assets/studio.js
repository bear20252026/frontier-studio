(function(){
  document.documentElement.classList.add('js');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.piece'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.vsection'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.filter'));
  var input = document.querySelector('#search');
  var result = document.querySelector('#result');
  var empty = document.querySelector('#empty');
  var selects = {
    form: document.querySelector('#f-form'),
    mechanism: document.querySelector('#f-mechanism'),
    engine: document.querySelector('#f-engine'),
    tempo: document.querySelector('#f-tempo')
  };
  var current = 'all';

  function hasOption(select, value){
    return !select || Array.prototype.some.call(select.options, function(opt){ return opt.value === value; });
  }
  function setSelect(axis, value){
    if(selects[axis] && hasOption(selects[axis], value)) selects[axis].value = value;
  }
  function setVolume(value){
    if(value === 'all' || buttons.some(function(b){ return b.getAttribute('data-filter') === value; })) current = value;
    buttons.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === current)); });
  }
  function readQuery(){
    var params = new URLSearchParams(window.location.search);
    ['form','mechanism','engine','tempo'].forEach(function(axis){
      var value = params.get(axis);
      if(value) setSelect(axis, value);
    });
    var volume = params.get('volume');
    if(volume) setVolume(volume);
  }
  function apply(){
    var q = (input && input.value || '').trim().toLowerCase();
    var form = selects.form ? selects.form.value : 'all';
    var mechanism = selects.mechanism ? selects.mechanism.value : 'all';
    var engine = selects.engine ? selects.engine.value : 'all';
    var tempo = selects.tempo ? selects.tempo.value : 'all';
    var shown = 0;
    cards.forEach(function(card){
      var okVol = current === 'all' || card.getAttribute('data-volume') === current;
      var okForm = form === 'all' || card.getAttribute('data-form') === form;
      var okMech = mechanism === 'all' || card.getAttribute('data-mechanism') === mechanism;
      var okEngine = engine === 'all' || card.getAttribute('data-engine') === engine;
      var okTempo = tempo === 'all' || card.getAttribute('data-tempo') === tempo;
      var okQ = !q || card.getAttribute('data-search').indexOf(q) !== -1;
      var show = okVol && okForm && okMech && okEngine && okTempo && okQ;
      card.style.display = show ? '' : 'none';
      if(show) shown++;
    });
    sections.forEach(function(sec){
      var visible = Array.prototype.some.call(sec.querySelectorAll('.piece'), function(c){ return c.style.display !== 'none'; });
      sec.hidden = !visible;
    });
    if(result) result.textContent = shown + ' / ' + cards.length;
    if(empty) empty.classList.toggle('show', shown === 0);
  }
  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      setVolume(btn.getAttribute('data-filter'));
      apply();
    });
  });
  Object.keys(selects).forEach(function(axis){
    if(selects[axis]) selects[axis].addEventListener('change', apply);
  });
  var reset = document.querySelector('#reset');
  if(reset) reset.addEventListener('click', function(){
    Object.keys(selects).forEach(function(axis){ if(selects[axis]) selects[axis].value = 'all'; });
    setVolume('all');
    if(input) input.value = '';
    if(window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    apply();
  });
  if(input) input.addEventListener('input', apply);
  var obs = ('IntersectionObserver' in window) ? new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, {rootMargin:'0px 0px -6% 0px', threshold:0.05}) : null;
  cards.forEach(function(card, i){
    if(obs) obs.observe(card); else card.classList.add('in');
    card.style.transitionDelay = String((i % 3) * 35) + 'ms';
  });
  readQuery();
  apply();
})();