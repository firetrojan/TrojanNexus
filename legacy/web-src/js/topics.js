// topics.js - "what is this about?" guesser. Works fully offline: it only looks at words (a name, an @handle, a link, a bio,
// or the text of a page) and scores them against a word list per topic. It says "not clear" when the words do not say.
// It never invents facts: every answer lists the words that caused it, and the source it came from (bio, page, name).
import { tokenize, stem } from './search.js';

// id | label | "use it when" line | "can do" line | words (space separated; word:weight; a_b = phrase)
const RAW = `
health|Health & wellness|learn about health and wellness|Shares health and wellness information|health healthy wellness wellbeing nutrition nutritionist dietitian diet doctor medical medicine clinic hospital therapy mental_health mindfulness meditation sleep immunity healing ayurveda herbal vitamins symptoms disease surgeon physio physiotherapy dentist weightloss weight_loss detox gut hormones healthcare patient nurse pharmacy cure remedies:0.8 doctors wellness_tips holistic anxiety:0.8 stress:0.6 calm:0.5
fitness|Fitness & training|follow workouts and fitness tips|Shares workouts and fitness training|fit fitness gym workout workouts yoga pilates crossfit bodybuilding bodybuilder calisthenics strength cardio trainer marathon running runner cycling hiit muscle muscles abs stretching mobility athlete lifting powerlifting gains:0.6 reps sweat
nature|Nature & wildlife|see nature, wildlife and the outdoors|Shares nature and wildlife content|nature wildlife wild forest forests jungle mountain mountains river rivers ocean lake birds birding birdwatching tiger tigers safari national_park earth ecology environment environmental climate conservation trees plants garden gardening flowers botany landscape hiking trek trekking camping outdoors waterfall himalaya himalayas animals zoo reef marine whale whales butterfly insects geology natgeo nationalgeographic naturelovers nature_lover wilderness sustainability sustainable green:0.5 earth_day rainforest planet_earth
space|Space & astronomy|follow space and astronomy news|Shares space and astronomy content|space nasa isro esa spacex astronomy astro cosmos cosmic galaxy universe telescope rocket rockets satellite satellites orbit mars moon lunar nebula astronaut astronauts cosmonaut planetary jwst hubble astrophysics solarsystem solar_system solar:0.7 launch:0.6 stargazing starlink exoplanet exoplanets cosmology
science|Science & research|learn about science and research|Shares science and research content|science sciences scientist scientists research researcher physics chemistry biology lab laboratory quantum nobel nobelprize journal scientific experiment experiments neuroscience genetics molecule molecules palaeontology paleontology palaeontologist paleontologist scholar:0.5 academic cern royal_society papers:0.6 study:0.4 studies:0.4 sciencenews stem peer_reviewed discovery:0.6 evolution biotech microbiology astrophysics
maths|Maths|practise or learn maths|Shares maths problems and ideas|math maths mathematics algebra calculus geometry trigonometry olympiad proof proofs theorem theorems number_theory statistics probability combinatorics arithmetic equations equation mathematician puzzles:0.6 numbers:0.5
tech|Technology & coding|learn coding and technology|Shares technology and coding content|tech technology code coding coder developer developers programming programmer software python javascript typescript linux opensource open_source github devops cybersecurity hacker hacking cloud:0.5 api webdev web_development frontend backend database algorithm algorithms computer computers gadgets hardware electronics arduino raspberry robotics iot sysadmin terminal startup_tech android ios app apps:0.5 website:0.4 engineering engineer engineers
ai|AI & machine learning|keep up with AI tools and news|Shares AI tools and news|ai artificial_intelligence machine_learning ml llm llms gpt chatgpt openai anthropic claude gemini deepseek neural deep_learning deeplearning prompt prompts prompting agents genai generative midjourney diffusion automation chatbot chatbots copilot aitools ai_tools
business|Business & startups|learn about business and startups|Shares business and startup advice|business businesses startup startups entrepreneur entrepreneurs entrepreneurship founder founders ceo marketing brand branding sales ecommerce shopify agency freelance freelancing hustle b2b saas growth leadership management strategy smallbusiness small_business marketer consultant consulting
finance|Money & investing|learn about money and investing|Shares money and investing content|finance financial money invest investing investor investors investment investments stock stocks market markets trading trader trading_tips crypto bitcoin ethereum wealth savings budget mutual_fund mutualfunds sip tax taxes banking bank loan credit passive_income economy economics forex fintech nifty sensex dividend dividends
education|Study & exams|prepare for exams and study|Shares study material and exam help|education educational study studying student students school college university exam exams exam_prep ielts toefl gre gmat sat jee neet upsc tutor tutoring course courses lecture lectures learn learning lesson lessons syllabus academy classes teacher teachers mentor homework curriculum edtech edu educator educators oxford cambridge harvard stanford mit iit iim uni universities admissions admission ivy ivyleague studyabroad study_abroad ucl coursera udemy nptel khanacademy tedx:0.6 ebook:0.5 notes:0.4
jobs|Jobs & opportunities|find jobs, scholarships and opportunities|Lists jobs, scholarships and opportunities|job jobs career careers hiring internship internships vacancy vacancies recruitment resume cv interview interviews fellowship fellowships grants grant opportunity opportunities scholarship scholarships remote competition competitions hackathon hackathons funding openings apply:0.5 deadline:0.5 stipend placement placements prize:0.5 prizes:0.5 award:0.4 awards:0.4
languages|Language learning|learn or practise a language|Shares language learning help|language languages english spanish french german japanese korean hindi mandarin arabic vocabulary grammar speaking duolingo pronunciation translation linguistics fluency bilingual polyglot
art|Art & illustration|get art and illustration inspiration|Shares art and illustration|art artist artists artwork artworks drawing drawings sketch sketching illustration illustrator painting painter paint canvas watercolor watercolour doodle gallery sculpture creative procreate concept_art fanart oilpainting calligraphy ink
design|Design|find design ideas and tools|Shares design ideas and tools|design designer designers ui ux graphic graphics typography font fonts logo logos figma canva layout poster posters mockup photoshop architecture architect interior interiors branding_design moodboard palette palettes
animation|Animation & film|follow animation and film|Shares animation and film content|animation animator animators animated anime cartoon cartoons blender motion vfx cgi pixar ghibli film films cinema movie movies filmmaker filmmaking director cinematography screenplay storyboard trailer shortfilm studio:0.5 3d:0.6 manga
photography|Photography & video|get photography and video tips|Shares photography and video content|photo photos photography photographer photographers camera cameras lens lightroom portrait portraits videography videographer drone cinematic timelapse shoot:0.5 editing:0.4 clicks:0.5 capture:0.4 reels:0.4
music|Music & audio|find music and audio|Shares music and audio|music musician musicians singer songs song guitar piano drums beats producer dj band album lyrics vocals rap hiphop lofi spotify playlist concert audio soundtrack orchestra violin tabla raga
books|Books & writing|find books and reading ideas|Shares books and writing|book books reading reader readers author authors novel novels poetry poet poems poem writer writers writing literature library libraries storytelling stories fiction kindle publishing bookstagram bookworm bookish bookclub nonfiction literary write writes
history|History & culture|learn history and culture|Shares history and culture|history historical ancient archaeology heritage culture civilization civilisation museum empire empires medieval mythology vintage:0.5 archive archives antique historian
mind|Philosophy & psychology|think about ideas, mind and philosophy|Shares philosophy and psychology|philosophy philosopher philosophers stoic stoicism wisdom psychology psychologist existential ethics thinking:0.6 thoughts:0.5 mind consciousness nietzsche plato jung mindset:0.6 cognitive behaviour behavior neuroscience:0.6 ideas:0.4 thinkers
motivation|Motivation & self-improvement|get motivation and self-improvement ideas|Shares motivation and self-improvement|motivation motivational inspiration inspirational inspire success discipline habits habit selfimprovement self_improvement goals productivity quotes affirmations positivity lifestyle:0.4 mindset:0.6 growth:0.4 mentor:0.4 sigma:0.6 grind
news|News & politics|keep up with news and politics|Shares news and politics|news breaking politics political government parliament election elections policy journalism journalist reporter media:0.6 geopolitics current_affairs headlines bbc cnn reuters newspaper press:0.6 times:0.4 daily:0.3 post:0.2 world:0.3 minister
food|Food & cooking|find recipes and food ideas|Shares recipes and food|food foodie foodies recipe recipes cooking cook chef kitchen baking bake cuisine restaurant restaurants cafe coffee:0.7 tea:0.6 street_food vegan vegetarian dessert desserts meal mealprep snack snacks biryani curry pizza burger delicious tasty homemade:0.5 eats foodblogger
travel|Travel & places|plan trips and find places|Shares travel and places|travel traveller traveler travelling traveling trip trips tour tours tourism tourist wanderlust explore explorer adventure backpacking backpacker vacation holiday holidays destination destinations hotel hotels itinerary roadtrip nomad visa abroad passport flights airline airport city_guide
fashion|Fashion & beauty|get fashion and beauty ideas|Shares fashion and beauty|fashion style stylist outfit outfits ootd clothing clothes streetwear makeup beauty skincare haircare hair jewellery jewelry sneakers thrift lookbook glam
sports|Sports|follow sports|Shares sports news and highlights|cricket football soccer basketball nba nfl ipl fifa tennis badminton hockey kabaddi f1 formula1 olympics olympic sports sport match matches stadium wrestling boxing mma ufc athlete:0.6 goal:0.3 team:0.3 fc
gaming|Gaming|follow games and gaming|Shares games and gaming|game games gaming gamer gamers esports playstation xbox nintendo steam minecraft valorant pubg bgmi fortnite gta roblox twitch speedrun chess gamedev unity unreal godot console consoles ps5 fps rpg
humor|Humour & memes|get memes and humour|Shares memes and humour|meme memes funny comedy comedian humor humour jokes joke laugh lol satire roast troll sarcasm standup parody skit skits funnyvideos relatable
spirit|Spirituality & religion|follow spirituality and religion|Shares spiritual and religious content|spiritual spirituality god temple bhakti bhagavad gita krishna shiva rama church bible quran islam buddha buddhism zen dharma yogi guru sadhguru prayer mantra karma vedic upanishad sutra sacred blessed faith
machines|Cars, bikes & aviation|follow cars, bikes and aircraft|Shares cars, bikes and aircraft|car cars bike bikes motorcycle motorcycles motor automotive ev engine racing supercar garage mechanic aviation aircraft pilot plane planes airplane airplanes aerospace drivers rider riders
diy|DIY & crafts|get DIY and craft ideas|Shares DIY and craft projects|diy craft crafts handmade woodworking woodwork sewing knitting crochet pottery homemade upcycle repair maker makers hacks:0.5 handcraft origami
society|Society & causes|follow causes, law and society|Shares causes, law and society|law legal lawyer lawyers advocate court legislation constitution rights:0.5 rti civic ngo charity nonprofit volunteer activism justice humanitarian unicef unesco redcross society:0.4 community:0.4 awareness:0.6 youth:0.6 sdg sdgs globalgoals global_goals sustainable_development equality feminist feminism
pets|Pets|see pets and animal care|Shares pets and animal care|dog dogs cat cats pet pets puppy puppies kitten kittens vet veterinary adoption:0.4 doggo petcare
`;

export const TOPICS = RAW.trim().split('\n').map(line => {
  const [id, label, use, cap, words] = line.split('|');
  return { id, label, use, cap, words: words.trim().split(/\s+/).map(w => { const [t, wt] = w.split(':'); return { text: t.replace(/_/g, ' '), w: wt ? parseFloat(wt) : 1 }; }) };
});
export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

// token (stemmed) -> [{ t: topicId, w }] and phrases
const WORD = new Map(), PHRASE = [], LONG = [];
for (const t of TOPICS) for (const { text, w } of t.words) {
  if (text.includes(' ')) { PHRASE.push({ t: t.id, w, text }); continue; }
  const s = stem(text);
  if (!WORD.has(s)) WORD.set(s, []);
  WORD.get(s).push({ t: t.id, w, word: text });
  if (text.length >= 4) LONG.push({ t: t.id, w, text, s });
}
const SHORT_OK = new Set(['edu', 'uni', 'mit', 'iit', 'iim', 'ai', 'ml', 'ui', 'ux', 'ev', 'dj', 'cv', 'f1', 'tv', 'dr', 'fc', '3d', 'ps5', 'gym', 'art', 'diy', 'dog', 'cat', 'car', 'sat', 'gre', 'ipl', 'nba', 'nfl', 'bbc', 'cnn', 'esa', 'ngo', 'rti', 'sip', 'cgi', 'vfx', 'api', 'mma', 'ufc', 'god', 'law', 'job', 'tax', 'sea']);

/** Words from the @handle: split on . _ - digits. Every part is also tried as a start or end of a longer joined word. */
function handleParts(handle) {
  const raw = String(handle || '').toLowerCase().replace(/^@/, '');
  const parts = raw.split(/[._\-\d]+/).filter(x => x.length > 1);
  return { raw, parts };
}

/** Score one block of text against every topic. Returns Map topicId -> { score, words:Set } */
function scoreText(text, weight, acc, opts = {}) {
  if (!text) return;
  const toks = tokenize(String(text).slice(0, opts.max || 6000)), seen = new Map();
  for (const tk of toks) { const s = stem(tk); seen.set(s, (seen.get(s) || 0) + 1); if (tk !== s) seen.set(tk, (seen.get(tk) || 0) + 1); }
  const add = (t, w, word, cnt) => {
    const e = acc.get(t) || { score: 0, words: new Set() }; acc.set(t, e);
    if (e.words.has(word)) return; e.words.add(word);
    e.score += weight * w * Math.min(1 + 0.35 * (cnt - 1), 1.7);
  };
  for (const [s, cnt] of seen) { const hit = WORD.get(s); if (hit) for (const x of hit) add(x.t, x.w, x.word, cnt); }
  if (PHRASE.length) { const flat = ' ' + toks.join(' ') + ' '; for (const p of PHRASE) if (flat.includes(' ' + p.text + ' ')) add(p.t, p.w, p.text, 1); }
}

/** Joined handles like "healthyfood" or "nobelprize": look inside the word, with safe rules against false hits.
 *  Whole word = full weight. 6+ letters anywhere = full weight. 5 letters at the start or end = 0.8. 4 letters at the start or end = 0.7.
 *  A match that sits inside a longer match is dropped ("scholar" inside "scholarship"). */
function scoreHandle(handle, weight, acc) {
  const { raw, parts } = handleParts(handle);
  const add = (t, w, word) => { const e = acc.get(t) || { score: 0, words: new Set() }; acc.set(t, e); if (e.words.has(word)) return; e.words.add(word); e.score += weight * w; };
  for (const part of parts) {
    const s = stem(part), hit = WORD.get(s) || WORD.get(part);
    if (hit && (part.length >= 3 || SHORT_OK.has(part))) { for (const x of hit) add(x.t, x.w, x.word); continue; }
    const found = [];
    for (const L of LONG) {
      for (const needle of (L.s !== L.text && L.s.length >= 5 ? [L.text, L.s] : [L.text])) {
        const i = part.indexOf(needle);
        if (i < 0 || part === needle) continue;
        const atStart = i === 0, atEnd = i + needle.length === part.length, n = needle.length;
        const f = n >= 6 ? 1 : (atStart || atEnd ? (n >= 5 ? 0.8 : 0.7) : 0);
        if (f) { found.push({ t: L.t, w: L.w * f, word: L.text, a: i, b: i + n }); break; }
      }
    }
    found.sort((x, y) => (y.b - y.a) - (x.b - x.a));
    const kept = [];
    for (const m of found) if (!kept.some(k => k.word !== m.word && k.a <= m.a && k.b >= m.b)) kept.push(m);
    for (const m of kept) add(m.t, m.w, m.word);
  }
  return raw;
}

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
/** Words made from a link: its host and path (docs.python.org/3/tutorial -> docs python org tutorial). Weak evidence. */
function urlWords(url) {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, '').replace(/\.[a-z]{2,}$/i, '') + ' ' + decodeURIComponent(u.pathname).replace(/[\/_\-.+]+/g, ' ')).trim(); } catch (e) { return ''; }
}

/**
 * guessTopic({ handle, name, title, bio, desc, keywords, headings, text, url, tags })
 * -> { top, second, conf: 'clear'|'maybe'|'none', basis: 'bio'|'page'|'name'|'link'|'none', words, ranked }
 * basis tells where the strongest evidence came from. Name-only evidence can never be "clear".
 */
export function guessTopic(inp = {}) {
  const acc = new Map(), src = {};   // src[source] = Map for the basis check
  const run = (key, weight, fn) => { const m = new Map(); fn(m); src[key] = m; for (const [t, e] of m) { const a = acc.get(t) || { score: 0, words: new Set() }; acc.set(t, a); a.score += e.score; e.words.forEach(w => a.words.add(w)); } };
  const bioish = clean([inp.bio, inp.desc].filter(Boolean).join(' . '));
  run('bio', 3, m => scoreText(bioish, 3, m));
  run('title', 2.5, m => scoreText(clean(inp.title || inp.name), 2.5, m));
  run('keywords', 2.5, m => scoreText(Array.isArray(inp.keywords) ? inp.keywords.join(' . ') : clean(inp.keywords), 2.5, m));
  run('headings', 2, m => scoreText(Array.isArray(inp.headings) ? inp.headings.join(' . ') : clean(inp.headings), 2, m));
  run('text', 1, m => scoreText(clean(inp.text), 1, m, { max: 5000 }));
  run('tags', 1.8, m => scoreText((inp.tags || []).filter(t => !/^(instagram|following|youtube|feed|import)$/.test(t)).join(' . '), 1.8, m));
  run('link', 1.2, m => scoreText(urlWords(inp.url), 1.2, m));
  run('handle', 2, m => { if (inp.handle) { scoreHandle(inp.handle, 2, m); scoreText(String(inp.handle).replace(/[._]+/g, ' '), 0, m); } });
  const ranked = [...acc.entries()].map(([id, e]) => ({ id, label: TOPIC_BY_ID[id].label, score: Math.round(e.score * 100) / 100, words: [...e.words].slice(0, 6) })).sort((a, b) => b.score - a.score);
  const top = ranked[0] || null, second = ranked[1] || null;
  // where did the leading topic come from?
  let basis = 'none';
  if (top) {
    const from = k => (src[k] && src[k].get(top.id) ? src[k].get(top.id).score : 0);
    const strong = from('bio') + from('keywords') + from('headings') + from('text') + from('title') * (inp.bio || inp.desc || inp.text ? 1 : 0);
    const nameish = from('handle') + (inp.handle || !inp.text ? from('title') : 0);
    basis = strong >= Math.max(1.5, nameish * 0.8) ? (from('bio') >= from('text') ? 'bio' : 'page') : (nameish >= 1.5 ? 'name' : (from('link') ? 'link' : 'name'));
  }
  const nameOnly = basis === 'name' || basis === 'link';
  let conf = 'none';
  if (top) {
    const clearScore = nameOnly ? 99 : 5, maybeScore = nameOnly ? 1.5 : 2.6;
    if (top.score >= clearScore && (!second || second.score <= top.score * 0.65)) conf = 'clear';
    else if (top.score >= maybeScore) conf = 'maybe';
  }
  if (conf === 'none') return { top: null, second: null, conf, basis: 'none', words: [], ranked: ranked.slice(0, 3) };
  const sec = second && second.score >= top.score * 0.6 && second.score >= (nameOnly ? 1.5 : 2.2) ? second : null;
  return { top, second: sec, conf, basis, words: top.words, ranked: ranked.slice(0, 3) };
}

export const BASIS_LABEL = { bio: 'the bio or description', page: 'the page text', name: 'the name only', link: 'the link only', none: '' };
const basisText = (b, kind) => (b === 'name' && kind === 'site' ? 'the title and link only' : BASIS_LABEL[b]);

/** One plain sentence about a guess. */
export function describeGuess(g, ctx = {}) {
  if (!g || g.conf === 'none') return ctx.read ? 'Not clear. What was read does not say what it is about.' : 'Not clear from the ' + (ctx.handle ? 'name' : 'title') + ' alone. A bio or the page itself would be needed.';
  const topics = g.second ? g.top.label + ' and ' + g.second.label : g.top.label;
  return (g.conf === 'clear' ? '' : 'Probably ') + topics + ' (from ' + basisText(g.basis, ctx.kind) + (g.words.length ? ': ' + g.words.slice(0, 4).join(', ') : '') + ').';
}

/** Tags, "use it when" and "can do" lines for a guess. Only wording from the word list, never new facts. */
export function guessFields(g, ctx = {}) {
  if (!g || g.conf === 'none' || !g.top) return { tags: [], useWhen: [], capabilities: [] };
  const ts = [g.top, g.second].filter(Boolean), kind = ctx.kind === 'account' ? 'account' : 'site';
  return {
    tags: ts.map(t => t.id === 'maths' ? 'maths' : t.id),
    useWhen: ts.slice(0, 2).map(t => TOPIC_BY_ID[t.id].use),
    capabilities: ts.slice(0, 1).map(t => (kind === 'account' ? TOPIC_BY_ID[t.id].cap + (g.basis === 'name' ? ' (guessed from the name)' : '') : TOPIC_BY_ID[t.id].cap))
  };
}
