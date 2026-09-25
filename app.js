const PROGRESS_KEY_PREFIX = 'churchHistoryRoundProgress';
const ROUND_KEY = 'churchHistoryCurrentRound';
const SELECTED_ROUNDS_KEY = 'churchHistorySelectedRounds';
const SCOPE_KEY = 'churchHistoryRoundOneScope';
let selectedRounds = loadSelectedRounds();
let STORIES = storiesForRounds(selectedRounds);
let progress = loadProgress();
let studyFilter = ['all', 'first', 'second'].includes(localStorage.getItem(SCOPE_KEY)) ? localStorage.getItem(SCOPE_KEY) : 'all';
let learnFilter = studyFilter;
let quiz = [];
let quizIndex = 0;
let score = 0;
let quizFilter = studyFilter;
let quizAnswerPool = [];
let centuryQuizActive = false;
let selectedCentury = null;
let pendingCenturyActivity = null;
let practiceTimer = null;
let timelineStory = null;
let timelineQueue = [];
let timelineAnswered = false;
let timelineTimer = null;
let sequenceSize = 3;
let sequenceStories = [];
let sequenceChecked = false;
let draggedSequenceId = null;
let openStoryId = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadSelectedRounds() {
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTED_ROUNDS_KEY));
    const valid = Array.isArray(saved) ? [...new Set(saved.map(Number).filter(round => ROUND_DATA[round]))] : [];
    if (valid.length) return valid.sort((a, b) => a - b);
  } catch {}
  const legacyRound = Number(localStorage.getItem(ROUND_KEY));
  return ROUND_DATA[legacyRound] ? [legacyRound] : [1];
}
function storiesForRounds(rounds) {
  return rounds.flatMap(round => ROUND_DATA[round].map(story => ({ ...story, round })));
}
function roundLabel() {
  return selectedRounds.length === 1 ? `Round ${selectedRounds[0]}` : `Rounds ${selectedRounds.join(' + ')}`;
}
function roundLabelUpper() { return roundLabel().toUpperCase(); }

function loadProgress() {
  const merged = {};
  try {
    if (selectedRounds.includes(1) && !localStorage.getItem(`${PROGRESS_KEY_PREFIX}1`) && localStorage.getItem('churchHistoryRoundOneProgress')) {
      localStorage.setItem(`${PROGRESS_KEY_PREFIX}1`, localStorage.getItem('churchHistoryRoundOneProgress'));
    }
    selectedRounds.forEach(round => Object.assign(merged, JSON.parse(localStorage.getItem(`${PROGRESS_KEY_PREFIX}${round}`)) || {}));
    return merged;
  }
  catch { return merged; }
}
function saveProgress() {
  selectedRounds.forEach(round => {
    const ids = new Set(ROUND_DATA[round].map(story => story.id));
    const roundProgress = Object.fromEntries(Object.entries(progress).filter(([id]) => ids.has(id)));
    localStorage.setItem(`${PROGRESS_KEY_PREFIX}${round}`, JSON.stringify(roundProgress));
  });
  updateProgressViews();
}
function loadAllProgress() {
  const merged = {};
  Object.keys(ROUND_DATA).forEach(round => {
    try { Object.assign(merged, JSON.parse(localStorage.getItem(`${PROGRESS_KEY_PREFIX}${round}`)) || {}); }
    catch {}
  });
  return merged;
}
function saveStoryProgress(id) {
  const round = Number(Object.keys(ROUND_DATA).find(key => ROUND_DATA[key].some(story => story.id === id)));
  if (!round) return;
  let roundProgress = {};
  try { roundProgress = JSON.parse(localStorage.getItem(`${PROGRESS_KEY_PREFIX}${round}`)) || {}; }
  catch {}
  roundProgress[id] = progress[id];
  localStorage.setItem(`${PROGRESS_KEY_PREFIX}${round}`, JSON.stringify(roundProgress));
  updateProgressViews();
}
function record(id, kind, value = 1) {
  progress[id] ||= { reviewed: false, correct: 0, attempts: 0, timeline: 0 };
  if (kind === 'reviewed') progress[id].reviewed = true;
  else progress[id][kind] = (progress[id][kind] || 0) + value;
  saveStoryProgress(id);
}
function stateFor(story) {
  const p = progress[story.id] || {};
  if ((p.correct || 0) >= 2 && (p.timeline || 0) >= 1) return 'mastered';
  if (p.reviewed || p.attempts || p.timeline) return 'learning';
  return 'not-started';
}
function shuffle(items) {
  const copy = [...items];
  for (let i=copy.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]]; }
  return copy;
}

const ANSWER_BANKS = {
  city: ['Jerusalem','Rome','Constantinople','Antioch','Alexandria','Nicaea','Ephesus','Avignon','Acre','Canterbury'],
  fallenCity: ['Fall of Acre','Fall of Constantinople','Fall of Jerusalem','Fall of Antioch'],
  emperor: ['Emperor Constantine','Nero','Emperor Diocletian','Emperor Theodosius I','Emperor Justinian','Charlemagne','Frederick Barbarossa','Hadrian'],
  pope: ['Pope St. Linus','Pope St. Leo the Great','Pope St. Gregory the Great','Pope Stephen VI','Pope St. Nicholas the Great','Pope St. Gregory VII','Pope St. Pius V','Pope Leo XIII','Pope St. Pius X','Pope St. John Paul II'],
  ruler: ['King Alfred the Great','King St. Stephen of Hungary','King St. Louis IX','St. Wenceslaus','Prince St. Vladimir','Henry the Fowler','Philip IV “the Fair”','Isabella “the Catholic”','Pelayo','St. Olga of Kyiv'],
  council: ['Council of Nicaea','Council of Ephesus','Council of Chalcedon','Second Council of Nicaea','Third Council of Constantinople','Council of Trent','First Vatican Council','Second Vatican Council','Synod of Whitby'],
  battle: ['Battle of Tours','Battle of Lepanto','Battle of Hastings','Battle of the Milvian Bridge','Battle of Agincourt','Battle of Vienna'],
  war: ['Hundred Years’ War','American Civil War','War of 1812','French and Indian War','World War I','World War II','Thirty Years’ War'],
  colony: ['Virginia','Georgia','Maryland','Pennsylvania','Massachusetts','Jamestown'],
  text: ['Declaration of Independence','Divine Comedy','Hadrian’s Rescript','Canon of the Bible','Summa Theologica','True Devotion to Mary','The Rule of St. Benedict'],
  writer: ['St. Ignatius of Antioch','St. Bede','St. Augustine of Hippo','St. Thomas Aquinas','Dante Alighieri','Tertullian','Origen','St. Jerome','St. Louis de Montfort','John Wycliffe'],
  founder: ['Jesus Christ','Mohammed','St. Benedict','St. Dominic','St. Francis of Assisi','St. Ignatius of Loyola','St. Paul of the Cross'],
  explorer: ['Christopher Columbus','Hernán Cortés','Ferdinand Magellan','Vasco da Gama','Leif Erikson','John Cabot'],
  group: ['Military Orders','The Trinitarians','Cathars','Freemasonry','Spanish Inquisition','The Jesuits','The Franciscans'],
  doctrine: ['Arianism','Montanism','Iconoclasm','Photian Schism','Eastern Schism','Western Schism','Cluniac Reform'],
  apparition: ['Our Lady of Guadalupe','Our Lady of Fatima','Our Lady of Lourdes','Our Lady of La Salette'],
  miracle: ['Eucharistic Miracle of Lanciano','The Miracle of Bolsena','The Miracle of Santarém','The Miracle of the Sun'],
  plague: ['The Black Death','Plague of Justinian','Antonine Plague','Great Plague of London'],
  volcano: ['Mount Vesuvius','Mount Etna','Mount St. Helens','Mount Tambora'],
  bishop: ['St. Nicholas','St. Aidan','St. Augustine of Hippo','St. Athanasius','St. Otto of Bamberg','St. Alphonsus Liguori'],
  monk: ['St. Benedict','St. Bede','St. Francis of Paola','Dionysius Exiguus','St. Odilo of Cluny','St. Charbel Makhlouf','St. Nicholas of Flüe'],
  femaleSaint: ['St. Scholastica','St. Joan of Arc','St. Catherine of Siena','St. Kateri Tekakwitha','St. Hildegard of Bingen','St. Rita of Cascia','St. Thérèse of Lisieux'],
  priest: ['St. Lawrence','St. John Vianney','St. Vincent de Paul','St. Maximilian Kolbe','St. Pio of Pietrelcina','St. Paul of the Cross'],
  missionary: ['St. Patrick','St. Boniface','Sts. Cyril and Methodius','St. Isaac Jogues','St. Willibrord','St. Ansgar','St. Columba'],
  martyr: ['St. Polycarp','St. Valentine','Sts. Perpetua and Felicity','St. Agatha','St. Lawrence','St. Solange','St. Thomas Becket'],
  saint: ['St. Christopher','St. Francis of Assisi','St. Dominic','St. Cecilia','St. Anthony','St. Simon Stock','St. Joseph of Cupertino'],
  person: ['Jesus Christ','Mohammed','Christopher Columbus','Squanto','Martin Luther','Dante Alighieri','Tertullian','Origen','Alcuin of York','Hernán Cortés'],
  event: ['The First Crusade','Fall of Rome','Pentecost','Avignon Papacy','French Revolution','The Age of Martyrs','The Roman Catacombs','The Printing Press']
};

function answerKind(story) {
  const q = story.question.toLowerCase();
  const answer = story.answer.toLowerCase();
  const listed = kind => (ANSWER_BANKS[kind] || []).includes(story.answer);
  if (/fall of which city/.test(q) || answer.startsWith('fall of ')) return 'fallenCity';
  if (listed('city') && /city/.test(q)) return 'city';
  if (answer.startsWith('pope ') || /^which pope\b|^who became pope\b|^who was the first pope\b/.test(q)) return 'pope';
  if (listed('emperor') || answer.startsWith('emperor ') || /^which (roman |first christian |holy )?emperor\b|^who was crowned holy roman emperor\b/.test(q)) return 'emperor';
  if (listed('council') || /^(which council|which meeting|which first ecumenical council)/.test(q)) return 'council';
  if (listed('battle') || /^(which .*battle|at which battle)/.test(q)) return 'battle';
  if (listed('war') || /^(which war|what war)|war lasted|war began|worldwide war|last war/.test(q)) return 'war';
  if (listed('colony') || /^which colony/.test(q)) return 'colony';
  if (listed('text') || /^what document|^which roman letter|books that make up|^which invention/.test(q)) return 'text';
  if (listed('writer') || /^who wrote|first known writer|which .*scholar wrote|which .*writer|which .*theologian|wrote works|wrote true devotion|translated the bible|wrote fourteen letters/.test(q)) return 'writer';
  if (listed('founder') && /found/.test(q) || /who founded|which .* founded|founder of/.test(q)) return 'founder';
  if (listed('explorer') || /^which sailor|^which conqueror/.test(q)) return 'explorer';
  if (listed('apparition') || /marian apparition|apparition of mary/.test(q)) return 'apparition';
  if (listed('miracle') || /eucharistic miracle|which miraculous image/.test(q)) return 'miracle';
  if (listed('plague') || /^which plague/.test(q)) return 'plague';
  if (listed('volcano') || /^which volcano/.test(q)) return 'volcano';
  if (listed('group') || /^which religious order|^what groups|^which group|^which secret society|^which church court/.test(q)) return 'group';
  if (listed('doctrine') || /^which heresy|^which movement|^which schism|^what movement|^what successful monastic reform|^what event describes.*breaking communion|^what crisis/.test(q)) return 'doctrine';
  if (listed('ruler') || /^which (christian |holy |first )?(king|queen|ruler|prince)\b/.test(q)) return 'ruler';
  if (/^which martyrs?\b|martyrdom/.test(q)) return 'martyr';
  if (/^which .*missionary\b|^who .*missionary|evangeliz/.test(q)) return 'missionary';
  if (/^which .*bishop\b/.test(q)) return 'bishop';
  if (/^which .*monk\b|^which .*abbot\b|^which .*hermit\b|religious brother/.test(q)) return 'monk';
  if (/^which (girl|nun|woman|young .*shepherdess|blind .*tertiary)|^who was .*sister|^whose .*\bher\b/.test(q)) return 'femaleSaint';
  if (/^which .*priest\b|^which .*deacon\b/.test(q)) return 'priest';
  if (/\bsaint\b|doctor of the church|father of the church/.test(q)) return 'saint';
  if (/^who\b|^whose\b|which .*scholar|which .*writer|which .*native american|which .*architect/.test(q)) return 'person';
  return 'event';
}

function buildDistractors(story) {
  const kind = answerKind(story);
  const learnedMatches = allStories().filter(item => item.id !== story.id && answerKind(item) === kind).map(item => item.answer);
  const sameQuizMatches = quizAnswerPool.filter(item => item.id !== story.id && answerKind(item) === kind).map(item => item.answer);
  const candidates = [...sameQuizMatches, ...learnedMatches, ...(ANSWER_BANKS[kind] || ANSWER_BANKS.event)]
    .filter((answer, index, list) => answer !== story.answer && list.indexOf(answer) === index);
  return shuffle(candidates).slice(0, 3);
}
function scopedStories() {
  return STORIES.filter(s => studyFilter === 'all' || s.millennium === studyFilter);
}
function scopeLabel() {
  if (studyFilter === 'first') return '1st Century–1000';
  if (studyFilter === 'second') return '1000–2000';
  return 'Both millennia';
}
function setRounds(rounds, filter = studyFilter) {
  const valid = [...new Set(rounds.map(Number).filter(round => ROUND_DATA[round]))].sort((a, b) => a - b);
  selectedRounds = valid.length ? valid : [1];
  STORIES = storiesForRounds(selectedRounds);
  progress = loadProgress();
  localStorage.setItem(SELECTED_ROUNDS_KEY, JSON.stringify(selectedRounds));
  localStorage.setItem(ROUND_KEY, selectedRounds[0]);
  setStudyFilter(filter);
}
function setRound(round, filter = 'all') { setRounds([Number(round)], filter); }
function toggleRound(round) {
  const chosen = Number(round);
  if (!ROUND_DATA[chosen]) return;
  if (selectedRounds.includes(chosen) && selectedRounds.length === 1) return;
  const next = selectedRounds.includes(chosen) ? selectedRounds.filter(item => item !== chosen) : [...selectedRounds, chosen];
  setRounds(next, studyFilter);
}
function setStudyFilter(filter) {
  studyFilter = ['first', 'second'].includes(filter) ? filter : 'all';
  learnFilter = studyFilter;
  quizFilter = studyFilter;
  localStorage.setItem(SCOPE_KEY, studyFilter);
  if (practiceTimer) clearTimeout(practiceTimer);
  practiceTimer = null;
  quiz = [];
  timelineStory = null;
  timelineQueue = [];
  timelineAnswered = false;
  if (timelineTimer) clearTimeout(timelineTimer);
  timelineTimer = null;
  sequenceStories = [];
  $$('[data-practice-filter]').forEach(b => b.classList.toggle('scope-selected', selectedRounds.includes(Number(b.dataset.round)) && b.dataset.practiceFilter === studyFilter));
  $$('[data-round-toggle]').forEach(button => {
    const selected = selectedRounds.includes(Number(button.dataset.roundToggle));
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.textContent = selected ? '✓' : '';
  });
  $$('[data-learn-filter]').forEach(b => b.classList.toggle('selected', b.dataset.learnFilter === studyFilter));
  $('#learn-round-label').textContent = roundLabelUpper();
  $('#timeline-map-title').textContent = studyFilter === 'all' ? (selectedRounds.length > 1 ? 'Your combined two-millennium map' : 'Your two-millennium map') : `Your ${scopeLabel()} map`;
  $('#progress-title').textContent = studyFilter === 'all' ? roundLabel() : `${roundLabel()} · ${scopeLabel()}`;
  renderStories();
  updateProgressViews();
}
function mediaMarkup(story, controls=false) {
  if (!story.visual) return `<span aria-hidden="true">${story.initials}</span>`;
  if (story.type === 'video') return `<video src="${story.visual}" ${controls ? 'controls autoplay' : 'muted preload="metadata"'} aria-label="Animation for ${story.name}"></video>`;
  return `<img src="${story.visual}" alt="${story.name}">`;
}

function showView(id, filter) {
  if (id === 'home') document.body.classList.remove('round-mode', 'century-mode');
  if (id === 'century') { document.body.classList.remove('round-mode'); document.body.classList.add('century-mode'); }
  if (id === 'rounds') { document.body.classList.add('round-mode'); document.body.classList.remove('century-mode'); }
  $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
  $$('.round-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  $$('.century-nav button').forEach(b => b.classList.toggle('active', b.dataset.centuryView === id));
  if (id === 'learn' && filter) setStudyFilter(filter);
  if (id === 'practice' && quiz.length === 0) startQuiz();
  if (id === 'timeline') { if (!timelineStory) newTimelineChallenge(); renderTimelineMap(); }
  if (id === 'sequence' && sequenceStories.length === 0) newSequenceChallenge();
  if (id === 'century') renderCenturyPicker();
  if (id === 'progress') renderProgressTable();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderStories() {
  $$('[data-learn-filter]').forEach(b => b.classList.toggle('selected', b.dataset.learnFilter === learnFilter));
  const stories = scopedStories();
  $('#story-grid').innerHTML = stories.map(s => `<button class="story-card" data-story="${s.id}">
    <div class="story-visual">${mediaMarkup(s)}</div>
    ${progress[s.id]?.reviewed ? '<span class="reviewed-ribbon" aria-label="Reviewed">✓</span>' : ''}
    <div class="story-card-copy"><span class="story-century">${s.century} · ${s.date}</span><h3>${s.name}</h3></div>
  </button>`).join('');
  $$('[data-story]').forEach(b => b.addEventListener('click', () => openStory(b.dataset.story)));
}

function openStory(id) {
  const s = STORIES.find(x => x.id === id) || allStories().find(x => x.id === id);
  if (!s) return;
  openStoryId = id;
  $('#dialog-media').innerHTML = mediaMarkup(s, true);
  $('#dialog-century').textContent = `${s.century} · ${s.date}`;
  $('#dialog-title').textContent = s.name;
  $('#dialog-summary').textContent = s.summary;
  $('#dialog-clue').textContent = s.clue;
  $('#story-dialog').showModal();
}

function startQuiz(filter = studyFilter) {
  if (practiceTimer) clearTimeout(practiceTimer);
  practiceTimer = null;
  quizFilter = filter;
  centuryQuizActive = false;
  const selected = scopedStories();
  quizAnswerPool = selected;
  const weak = shuffle(selected.filter(s => stateFor(s) !== 'mastered'));
  const mastered = shuffle(selected.filter(s => stateFor(s) === 'mastered'));
  quiz = [...weak, ...mastered]; quizIndex = 0; score = 0;
  $('#practice-label').textContent = filter === 'first' ? `${roundLabelUpper()} · 1ST CENTURY–1000` : filter === 'second' ? `${roundLabelUpper()} · 1000–2000` : `${roundLabelUpper()} · ALL ${quiz.length} STORIES`;
  $('#question-total').textContent = quiz.length;
  $('#score-total').textContent = quiz.length;
  $('#quiz-card').classList.remove('hidden'); $('#quiz-finish').classList.add('hidden');
  renderQuestion();
}
function renderQuestion() {
  const s = quiz[quizIndex];
  $('#question-number').textContent = quizIndex + 1;
  $('#quiz-track').style.width = `${quizIndex / quiz.length * 100}%`;
  $('#question-century').textContent = centuryQuizActive ? `${s.century.toUpperCase()} · ROUND ${s.round}` : `${roundLabelUpper()} · ${s.millennium === 'first' ? 'FIRST' : 'SECOND'} MILLENNIUM`;
  $('#question-text').textContent = s.question;
  $('#answer-feedback').textContent = ''; $('#answer-feedback').className = 'feedback';
  $('#next-question').disabled = false;
  $('#next-question').classList.add('hidden');
  const distractors = buildDistractors(s);
  const answers = shuffle([s.answer,...distractors]);
  $('#answer-list').innerHTML = answers.map(a => `<button class="answer">${a}</button>`).join('');
  $$('.answer').forEach(b => b.addEventListener('click', event => answerQuestion(b, s, event)));
}
function answerQuestion(button, story, event) {
  if ($('.answer:disabled')) return;
  if (event?.detail > 0 && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) button.blur();
  const correct = button.textContent === story.answer;
  record(story.id, 'attempts');
  $$('.answer').forEach(b => { b.disabled = true; if (b.textContent === story.answer) b.classList.add('correct'); });
  if (correct) {
    score++;
    record(story.id,'correct');
    $('#answer-feedback').textContent = '';
    $('#next-question').classList.add('hidden');
    practiceTimer = setTimeout(nextQuestion, 700);
  } else {
    button.classList.add('wrong');
    $('#answer-feedback').textContent = `The answer is ${story.answer}. ${story.clue}`;
    $('#answer-feedback').className='feedback try';
    $('#next-question').textContent = quizIndex === quiz.length - 1 ? 'See my score' : 'Next question';
    $('#next-question').classList.remove('hidden');
  }
}
function nextQuestion() {
  if (practiceTimer) clearTimeout(practiceTimer);
  practiceTimer = null;
  quizIndex++;
  if (quizIndex < quiz.length) renderQuestion(); else finishQuiz();
}
function finishQuiz() {
  $('#quiz-card').classList.add('hidden'); $('#quiz-finish').classList.remove('hidden');
  $('#score-number').textContent = score;
  const percent = score / quiz.length;
  $('#score-message').textContent = percent >= .9 ? 'Excellent work. Those connections are becoming strong.' : percent >= .7 ? 'Good work. A little review will make these stories stick.' : 'Every mistake shows you what to practice next. Keep building the timeline.';
}

function newTimelineChallenge(skipCurrent = false) {
  if (timelineTimer) {
    clearTimeout(timelineTimer);
    timelineTimer = null;
  }
  if (skipCurrent && timelineStory && !timelineAnswered && (progress[timelineStory.id]?.timeline || 0) < 1 && !timelineQueue.some(s => s.id === timelineStory.id)) {
    timelineQueue.push(timelineStory);
  }
  if (timelineQueue.length === 0) {
    timelineQueue = shuffle(activityStories().filter(s => (progress[s.id]?.timeline || 0) < 1));
  }
  if (timelineQueue.length === 0) {
    timelineStory = null;
    timelineAnswered = true;
    $('#timeline-portrait').innerHTML = '<span aria-hidden="true">✓</span>';
    $('#timeline-name').textContent = 'Timeline complete!';
    $('#timeline-clue').textContent = document.body.classList.contains('century-mode') ? `You correctly placed all ${activityStories().length} stories from the ${selectedCentury}.` : `You correctly placed all ${activityStories().length} stories in ${scopeLabel()}.`;
    $('#century-options').innerHTML = '';
    $('#timeline-feedback').textContent = 'Every century on your map is filled.';
    $('#new-timeline').textContent = 'All stories placed';
    $('#new-timeline').disabled = true;
    return;
  }
  timelineStory = timelineQueue.shift();
  timelineAnswered = false;
  $('#new-timeline').textContent = 'Skip for now';
  $('#new-timeline').disabled = false;
  $('#timeline-portrait').innerHTML = mediaMarkup(timelineStory);
  $('#timeline-name').textContent = timelineStory.name;
  $('#timeline-clue').textContent = timelineStory.clue;
  $('#timeline-feedback').textContent = '';
  const centuryMode = document.body.classList.contains('century-mode');
  const correctPlacement = centuryMode ? timelineStory.date : timelineStory.century;
  const optionPool = centuryMode ? storiesInCentury(selectedCentury) : scopedStories();
  const others = shuffle(optionPool.filter(s => s.id !== timelineStory.id).map(s => centuryMode ? s.date : s.century)).filter((x,i,a)=>a.indexOf(x)===i && x !== correctPlacement).slice(0,3);
  $('#century-options').innerHTML = shuffle([correctPlacement,...others]).map(c => `<button>${c}</button>`).join('');
  $$('#century-options button').forEach(b => b.addEventListener('click', () => answerTimeline(b)));
}
function answerTimeline(button) {
  if ($('#century-options button:disabled')) return;
  const centuryMode = document.body.classList.contains('century-mode');
  const correctPlacement = centuryMode ? timelineStory.date : timelineStory.century;
  const correct = button.textContent === correctPlacement;
  timelineAnswered = true;
  $$('#century-options button').forEach(b => { b.disabled=true; if (b.textContent===correctPlacement) b.classList.add('correct'); });
  if (correct) { record(timelineStory.id,'timeline'); $('#timeline-feedback').textContent=centuryMode ? `Correct. ${timelineStory.name} belongs at ${timelineStory.date} in the ${selectedCentury}.` : `Correct. ${timelineStory.name} belongs in the ${timelineStory.century}.`; }
  else {
    button.classList.add('wrong');
    if (!timelineQueue.some(s => s.id === timelineStory.id)) timelineQueue.push(timelineStory);
    $('#timeline-feedback').textContent=centuryMode ? `${timelineStory.name} belongs at ${timelineStory.date}. It will come back later.` : `${timelineStory.name} belongs in the ${timelineStory.century}. It will come back later.`;
  }
  timelineTimer = setTimeout(() => newTimelineChallenge(), 1800);
}
function renderTimelineMap() {
  const groups = [];
  activityStories().forEach(story => {
    let group = groups.find(item => item.century === story.century);
    if (!group) { group = { century: story.century, stories: [] }; groups.push(group); }
    group.stories.push(story);
  });
  $('#timeline-map-grid').innerHTML = groups.map(group => {
    const placedCount = group.stories.filter(story => (progress[story.id]?.timeline || 0) >= 1).length;
    const status = placedCount === group.stories.length ? 'placed' : placedCount ? 'partly-placed' : '';
    const events = group.stories.map(story => {
      const placed = (progress[story.id]?.timeline || 0) >= 1;
      const roundTag = document.body.classList.contains('century-mode') || selectedRounds.length > 1 ? `<small>R${story.round}</small>` : '';
      return `<span class="century-event ${placed ? 'event-placed' : ''}">${roundTag}${placed ? story.name : '—'}</span>`;
    }).join('');
    return `<div class="century-cell ${status}"><strong>${group.century}</strong><div class="century-events">${events}</div></div>`;
  }).join('');
}

const STORY_YEARS = {
  jesus:30, ignatius:107, christopher:250, nicholas:343, patrick:461, benedict:547, aidan:651, boniface:754, cyril:885, wenceslaus:929,
  crusade:1095, becket:1170, francis:1226, plague:1347, columbus:1492, guadalupe:1531, squanto:1621, declaration:1776, bosco:1888, pio:1968,
  'r2-jerusalem':70, 'r2-polycarp':156, 'r2-valentine':269, 'r2-nicaea':325, 'r2-leo':452, 'r2-scholastica':543, 'r2-mohammed':632,
  'r2-bede':735, 'r2-cadaver':897, 'r2-cluny':910, 'r2-eastern-schism':1054, 'r2-military-orders':1113, 'r2-dominic':1221,
  'r2-avignon':1309, 'r2-joan':1431, 'r2-francis-paola':1507, 'r2-jogues':1646, 'r2-alphonsus':1787, 'r2-civil-war':1861, 'r2-gemma':1903,
  'r3-nero':64, 'r3-montanism':175, 'r3-perpetua-felicity':203, 'r3-arianism':318, 'r3-leo-vandals':455, 'r3-gregory-blessing':590,
  'r3-cuthbert':687, 'r3-tours':732, 'r3-nicholas-great':867, 'r3-poppo':965, 'r3-gregory-vii':1077, 'r3-trinitarians':1198,
  'r3-aquinas':1274, 'r3-catherine-siena':1377, 'r3-hundred-years-war':1453, 'r3-luther':1517, 'r3-kateri':1680, 'r3-gerard':1755,
  'r3-war-1812':1812, 'r3-fatima':1917,
  'r4-vesuvius':79, 'r4-justin':155, 'r4-sixtus':258, 'r4-athanasius':373, 'r4-augustine-hippo':430,
  'r4-augustine-canterbury':597, 'r4-constantinople-iii':681, 'r4-iconoclasm':750, 'r4-charlemagne':800, 'r4-john-xii':964,
  'r4-henry-cunigunde':1024, 'r4-bernard':1153, 'r4-fourth-crusade':1204, 'r4-western-schism':1378, 'r4-printing-press':1453,
    'r4-trent':1545, 'r4-virginia':1607, 'r4-georgia':1732, 'r4-vianney':1859, 'r4-world-war-i':1914,
    'r5-peter':64, 'r5-cecilia':177, 'r5-lawrence':258, 'r5-constantine':312, 'r5-fall-rome':476,
    'r5-justinian':527, 'r5-kilian':689, 'r5-nicaea-ii':787, 'r5-alcuin':804, 'r5-wolfgang':994,
    'r5-olaf':1030, 'r5-otto':1124, 'r5-acre':1291, 'r5-brigid-sweden':1370, 'r5-fall-constantinople':1453,
    'r5-pius-v':1571, 'r5-vincent':1660, 'r5-french-indian-war':1754, 'r5-lourdes':1858, 'r5-world-war-ii':1939,
    'r6-paul':64, 'r6-telesphorus':136, 'r6-agatha':251, 'r6-helena':328, 'r6-ephesus':431,
    'r6-vigilius':555, 'r6-benedict-biscop':690, 'r6-leo-iii':800, 'r6-alfred':899, 'r6-stephen-hungary':1000,
    'r6-urban-ii':1095, 'r6-barbarossa':1190, 'r6-louis-ix':1270, 'r6-wycliffe':1384, 'r6-inquisition':1478,
    'r6-lepanto':1571, 'r6-westphalia':1648, 'r6-freemasonry':1717, 'r6-vatican-i':1869, 'r6-kolbe':1941,
    'r7-linus':67, 'r7-five-good-emperors':96, 'r7-origen':233, 'r7-anthony':356, 'r7-clovis':496,
    'r7-isidore':636, 'r7-willibrord':739, 'r7-john-damascene':749, 'r7-photian-schism':863, 'r7-vladimir':988,
    'r7-benedict-ix':1032, 'r7-hildegard':1179, 'r7-elizabeth-hungary':1231, 'r7-philip-fair':1307, 'r7-isabella':1492,
    'r7-cortes':1521, 'r7-claver':1654, 'r7-french-revolution':1789, 'r7-leo-xiii':1886, 'r7-vatican-ii':1962,
    'r8-clement':97, 'r8-hadrian-rescript':124, 'r8-tertullian':200, 'r8-bible-canon':382, 'r8-jerome':405,
    'r8-columba':565, 'r8-adamnan':697, 'r8-lanciano':750, 'r8-ansgar':826, 'r8-henry-fowler':919,
    'r8-hastings':1066, 'r8-cathars':1150, 'r8-simon-stock':1251, 'r8-dante':1321, 'r8-rita':1457,
    'r8-teresa-avila':1562, 'r8-martin-porres':1639, 'r8-paul-cross':1720, 'r8-charbel':1898, 'r8-pius-x':1910,
    'r9-pentecost':33, 'r9-catacombs':150, 'r9-age-martyrs':250, 'r9-milvian':312, 'r9-chalcedon':451,
    'r9-anno-domini':525, 'r9-whitby':664, 'r9-pelayo':722, 'r9-solange':880, 'r9-olga':969,
    'r9-odilo':1049, 'r9-gilbert':1189, 'r9-anthony-padua':1231, 'r9-margaret-castello':1320,
    'r9-nicholas-flue':1487, 'r9-ignatius-loyola':1556, 'r9-joseph-cupertino':1663,
    'r9-louis-montfort':1716, 'r9-therese':1897, 'r9-john-paul-ii':2005
};
function storyOrder(story) { return STORY_YEARS[story.id] ?? 9999; }

const CENTURIES = ['1st Century','100s','200s','300s','400s','500s','600s','700s','800s','900s','1000s','1100s','1200s','1300s','1400s','1500s','1600s','1700s','1800s','1900s'];
function allStories() {
  return storiesForRounds(Object.keys(ROUND_DATA).map(Number));
}
function storiesInCentury(century) {
  return allStories().filter(story => story.century === century).sort((a, b) => storyOrder(a) - storyOrder(b) || a.round - b.round);
}
function activityStories() {
  return document.body.classList.contains('century-mode') && selectedCentury ? storiesInCentury(selectedCentury) : scopedStories();
}
function renderCenturyPicker() {
  $('#century-picker').innerHTML = CENTURIES.map(century => `<button class="${century === selectedCentury ? 'selected' : ''}" data-century-choice="${century}" aria-pressed="${century === selectedCentury}">${century}</button>`).join('');
  $$('[data-century-choice]').forEach(button => button.addEventListener('click', () => chooseCentury(button.dataset.centuryChoice)));
}
function chooseCentury(century) {
  selectedCentury = century;
  Object.assign(progress, loadAllProgress());
  $('#century-picker').classList.remove('needs-choice');
  $('#century-instruction').classList.remove('needs-choice');
  $('#century-instruction').textContent = 'Choose a century to learn all nine events in chronological order, then take the century quiz.';
  renderCenturyPicker();
  const stories = storiesInCentury(century);
  $('#century-study').classList.remove('hidden');
  $('#century-study-title').textContent = `${century} · ${stories.length} events`;
  $('#century-story-list').innerHTML = stories.map((story, index) => `<button class="century-story-row" data-century-story="${story.id}">
    <span class="century-order">${index + 1}</span>
    <span class="century-row-visual">${mediaMarkup(story)}</span>
    <span class="century-row-copy"><small>${story.date} · Round ${story.round}</small><strong>${story.name}</strong><span>${story.summary}</span></span>
  </button>`).join('');
  $$('[data-century-story]').forEach(button => button.addEventListener('click', () => openStory(button.dataset.centuryStory)));
  if (pendingCenturyActivity) {
    const requestedActivity = pendingCenturyActivity;
    pendingCenturyActivity = null;
    openCenturyActivity(requestedActivity);
    return;
  }
  $('#century-study').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function startCenturyQuiz() {
  if (!selectedCentury) return;
  if (practiceTimer) clearTimeout(practiceTimer);
  practiceTimer = null;
  Object.assign(progress, loadAllProgress());
  centuryQuizActive = true;
  quizAnswerPool = allStories();
  quiz = storiesInCentury(selectedCentury);
  quizIndex = 0;
  score = 0;
  $('#practice-label').textContent = `${selectedCentury.toUpperCase()} · CHRONOLOGICAL QUIZ`;
  $('#question-total').textContent = quiz.length;
  $('#score-total').textContent = quiz.length;
  $('#quiz-card').classList.remove('hidden');
  $('#quiz-finish').classList.add('hidden');
  renderQuestion();
  showView('practice');
}

function openCenturyActivity(view) {
  document.body.classList.remove('round-mode');
  document.body.classList.add('century-mode');
  if (view === 'century') {
    pendingCenturyActivity = null;
    showView('century');
    return;
  }
  if (!selectedCentury) {
    pendingCenturyActivity = view;
    showView('century');
    const labels = { practice: 'Practice a Century', timeline: 'Practice a Timeline', sequence: 'Practice a Sequence' };
    $('#century-instruction').textContent = `Choose a century above to begin ${labels[view]}.`;
    $('#century-instruction').classList.add('needs-choice');
    $('#century-picker').classList.add('needs-choice');
    $('#century-picker').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  Object.assign(progress, loadAllProgress());
  if (view === 'practice') {
    startCenturyQuiz();
    return;
  }
  if (view === 'timeline') {
    if (timelineTimer) clearTimeout(timelineTimer);
    timelineTimer = null;
    timelineStory = null;
    timelineQueue = [];
    timelineAnswered = false;
    $('#timeline-map-title').textContent = `Your ${selectedCentury} timeline`;
    showView('timeline');
    return;
  }
  if (view === 'sequence') {
    sequenceStories = [];
    sequenceChecked = false;
    showView('sequence');
  }
}

function newSequenceChallenge(size = sequenceSize) {
  sequenceSize = size;
  sequenceChecked = false;
  const chosen = shuffle(activityStories()).slice(0, sequenceSize);
  sequenceStories = shuffle(chosen);
  const alreadyOrdered = sequenceStories.every((story, index, items) => index === 0 || storyOrder(items[index - 1]) < storyOrder(story));
  if (alreadyOrdered) [sequenceStories[0], sequenceStories[1]] = [sequenceStories[1], sequenceStories[0]];
  $$('[data-sequence-size]').forEach(button => button.classList.toggle('selected', Number(button.dataset.sequenceSize) === sequenceSize));
  $('#sequence-feedback').textContent = '';
  $('#sequence-feedback').className = 'sequence-feedback';
  renderSequence();
}

function renderSequence() {
  const correctOrder = [...sequenceStories].sort((a, b) => storyOrder(a) - storyOrder(b));
  $('#sequence-list').innerHTML = sequenceStories.map((story, index) => {
    const misplaced = sequenceChecked && story.id !== correctOrder[index].id;
    return `<div class="sequence-row ${misplaced ? 'misplaced' : ''}" data-sequence-id="${story.id}" tabindex="0" title="Grab and drag to reorder" aria-label="${story.name}. Position ${index + 1}. Drag to reorder.">
      <span class="drag-handle" aria-hidden="true">⠿</span>
      <span class="sequence-number">${index + 1}</span>
      <div class="sequence-event"><strong>${story.name}</strong><span>${story.clue}</span></div>
    </div>`;
  }).join('');
  $$('#sequence-list .sequence-row').forEach(row => {
    row.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const index = sequenceStories.findIndex(story => story.id === row.dataset.sequenceId);
      moveSequence(index, event.key === 'ArrowUp' ? -1 : 1);
      $(`[data-sequence-id="${row.dataset.sequenceId}"]`)?.focus();
    });
    row.addEventListener('dragstart', event => {
      draggedSequenceId = row.dataset.sequenceId;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedSequenceId);
    });
    row.addEventListener('dragover', event => {
      event.preventDefault();
      if (row.dataset.sequenceId === draggedSequenceId) return;
      clearSequenceDropMarkers();
      const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      row.classList.add(after ? 'drop-after' : 'drop-before');
      event.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('drop', event => {
      event.preventDefault();
      if (!draggedSequenceId || row.dataset.sequenceId === draggedSequenceId) return;
      const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      reorderSequence(draggedSequenceId, row.dataset.sequenceId, after);
    });
    row.addEventListener('dragend', () => {
      draggedSequenceId = null;
      clearSequenceDropMarkers();
      row.classList.remove('dragging');
    });
    row.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      draggedSequenceId = row.dataset.sequenceId;
      row.classList.add('dragging');
      row.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    row.addEventListener('pointermove', event => {
      if (draggedSequenceId !== row.dataset.sequenceId) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.sequence-row');
      clearSequenceDropMarkers();
      row.classList.add('dragging');
      if (!target || target.dataset.sequenceId === draggedSequenceId) return;
      const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
      target.classList.add(after ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('pointerup', event => {
      if (draggedSequenceId !== row.dataset.sequenceId) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.sequence-row');
      if (target && target.dataset.sequenceId !== draggedSequenceId) {
        const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
        reorderSequence(draggedSequenceId, target.dataset.sequenceId, after);
      } else {
        draggedSequenceId = null;
        clearSequenceDropMarkers();
        row.classList.remove('dragging');
      }
    });
    row.addEventListener('pointercancel', () => {
      draggedSequenceId = null;
      clearSequenceDropMarkers();
      row.classList.remove('dragging');
    });
  });
}

function clearSequenceDropMarkers() {
  $$('.sequence-row').forEach(row => row.classList.remove('drop-before', 'drop-after'));
}

function reorderSequence(draggedId, targetId, after) {
  const from = sequenceStories.findIndex(story => story.id === draggedId);
  if (from < 0) return;
  const [moved] = sequenceStories.splice(from, 1);
  let target = sequenceStories.findIndex(story => story.id === targetId);
  if (target < 0) return;
  if (after) target += 1;
  sequenceStories.splice(target, 0, moved);
  sequenceChecked = false;
  draggedSequenceId = null;
  $('#sequence-feedback').textContent = '';
  $('#sequence-feedback').className = 'sequence-feedback';
  renderSequence();
}

function moveSequence(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= sequenceStories.length) return;
  [sequenceStories[index], sequenceStories[target]] = [sequenceStories[target], sequenceStories[index]];
  sequenceChecked = false;
  $('#sequence-feedback').textContent = '';
  $('#sequence-feedback').className = 'sequence-feedback';
  renderSequence();
}

function checkSequence() {
  const correct = sequenceStories.every((story, index, items) => index === 0 || storyOrder(items[index - 1]) < storyOrder(story));
  sequenceChecked = true;
  if (correct) {
    $('#sequence-feedback').textContent = `Correct! ${sequenceStories.map(story => `${story.name} (${story.century})`).join(' · ')}`;
    $('#sequence-feedback').className = 'sequence-feedback good';
  } else {
    $('#sequence-feedback').textContent = 'Not quite. Move the highlighted events and check again.';
    $('#sequence-feedback').className = 'sequence-feedback try';
  }
  renderSequence();
}

function updateProgressViews() {
  const stories = scopedStories();
  const states = stories.map(stateFor);
  const mastered = states.filter(x=>x==='mastered').length;
  const learning = states.filter(x=>x==='learning').length;
  $('#home-mastered').textContent = mastered;
  $('#home-mastered-label').textContent = `of ${stories.length} stories mastered · ${scopeLabel()}`;
  $('#home-progress-track').setAttribute('aria-label', `${roundLabel()} progress`);
  $('#home-progress-bar').style.width = `${mastered/stories.length*100}%`;
  $('#progress-mastered').textContent = mastered;
  $('#progress-learning').textContent = learning;
  $('#progress-not-started').textContent = stories.length-mastered-learning;
  renderTimelineMap();
}
function renderProgressTable() {
  $('#progress-table').innerHTML = scopedStories().map(s => {
    const p=progress[s.id]||{}; const state=stateFor(s); const label=state==='mastered'?'Mastered':state==='learning'?'Learning':'Not started';
    return `<tr><td>${s.century}</td><td><strong>${s.name}</strong></td><td>${p.correct||0} correct / ${p.attempts||0} tried</td><td>${p.timeline||0} correct</td><td><span class="status-pill ${state}">${label}</span></td></tr>`;
  }).join('');
}

$$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view,b.dataset.filter)));
$$('[data-century-view]').forEach(button => button.addEventListener('click', () => openCenturyActivity(button.dataset.centuryView)));
$$('[data-learn-filter]').forEach(b => b.addEventListener('click', () => setStudyFilter(b.dataset.learnFilter)));
$$('[data-round-toggle]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); toggleRound(button.dataset.roundToggle); }));
$$('[data-practice-filter]').forEach(b => b.addEventListener('click', () => { setRound(b.dataset.round, b.dataset.practiceFilter); startQuiz(); showView('practice'); }));
$('#next-question').addEventListener('click', nextQuestion);
$('#practice-again').addEventListener('click', () => centuryQuizActive ? startCenturyQuiz() : startQuiz(quizFilter));
$('#new-timeline').addEventListener('click', () => newTimelineChallenge(true));
$$('[data-sequence-size]').forEach(button => button.addEventListener('click', () => newSequenceChallenge(Number(button.dataset.sequenceSize))));
$('#check-sequence').addEventListener('click', checkSequence);
$('#new-sequence').addEventListener('click', () => newSequenceChallenge(sequenceSize));
$('#start-century-quiz').addEventListener('click', startCenturyQuiz);
$('#dialog-close').addEventListener('click', () => $('#story-dialog').close());
$('#story-dialog').addEventListener('click', e => { if(e.target === $('#story-dialog')) $('#story-dialog').close(); });
$('#mark-reviewed').addEventListener('click', () => { record(openStoryId,'reviewed'); $('#story-dialog').close(); renderStories(); });
$('#reset-progress').addEventListener('click', () => { if(confirm(`Reset all ${roundLabel()} progress on this device?`)) { progress={}; saveProgress(); renderProgressTable(); renderStories(); } });

setStudyFilter(studyFilter);
renderCenturyPicker();

// Offer the same core actions to browsers that support the emerging WebMCP standard.
if (document.modelContext?.registerTool) {
  const toolLifecycle = new AbortController();
  Promise.resolve(document.modelContext.registerTool({
    name: 'start_daily_practice',
    title: 'Start daily practice',
    description: 'Start a new practice session using all stories in the selected rounds and show it on screen.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() {
      setStudyFilter('all');
      startQuiz();
      showView('practice');
      return { started: true, questions: quiz.length, rounds: selectedRounds };
    }
  }, { signal: toolLifecycle.signal })).catch(() => {});

  Promise.resolve(document.modelContext.registerTool({
    name: 'read_round_one_progress',
    title: 'Read current round progress',
    description: 'Read the number of stories mastered, currently being learned, and not started in the current round on this device.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      const states = STORIES.map(stateFor);
      return {
        mastered: states.filter(state => state === 'mastered').length,
        learning: states.filter(state => state === 'learning').length,
        notStarted: states.filter(state => state === 'not-started').length
      };
    }
  }, { signal: toolLifecycle.signal })).catch(() => {});
}
