(function(){
  document.documentElement.classList.add('js');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.piece'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.vsection'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.filter'));
  var input = document.querySelector('#search');
  var result = document.querySelector('#result');
  var empty = document.querySelector('#empty');
  var current = 'all';
  function apply(){
    var q = (input && input.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function(card){
      var okVol = current === 'all' || card.getAttribute('data-volume') === current;
      var okQ = !q || card.getAttribute('data-search').indexOf(q) !== -1;
      var show = okVol && okQ;
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
      current = btn.getAttribute('data-filter');
      buttons.forEach(function(b){ b.setAttribute('aria-pressed', String(b === btn)); });
      apply();
    });
  });
  if(input) input.addEventListener('input', apply);
  var obs = ('IntersectionObserver' in window) ? new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, {rootMargin:'0px 0px -6% 0px', threshold:0.05}) : null;
  cards.forEach(function(card, i){
    if(obs) obs.observe(card); else card.classList.add('in');
    card.style.transitionDelay = String((i % 3) * 35) + 'ms';
  });
  apply();
})();