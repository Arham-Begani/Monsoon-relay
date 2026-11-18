(() => {
  const translatedRoads = new Map([
    ['murphy road', ['मर्फी रोड', 'मर्फ़ी रोड']],
    ['cambridge road', ['कैम्ब्रिज रोड', 'कैंब्रिज रोड', 'कैम्ब्रिज सड़क', 'कैंब्रिज सड़क']],
    ['gangadhar chetty road', ['गंगाधर चेट्टी रोड', 'गंगाधर चेट्टी सड़क']],
    ['bhaskaran road', ['भास्करन रोड']],
    ['yellamma koil street', ['येल्लम्मा कोइल स्ट्रीट', 'येलम्मा कोइल स्ट्रीट']],
    ['local road', ['स्थानीय सड़क', 'लोकल रोड']],
  ]);
  const sectionNumbers = [
    ['one', 'first', 'एक', 'पहला'],
    ['two', 'second', 'दो', 'दूसरा'],
    ['three', 'third', 'तीन', 'तीसरा'],
    ['four', 'fourth', 'चार', 'चौथा'],
    ['five', 'fifth', 'पाँच', 'पांच', 'पाँचवां'],
    ['six', 'sixth', 'छह', 'छठा'],
    ['seven', 'seventh', 'सात', 'सातवां'],
    ['eight', 'eighth', 'आठ', 'आठवां'],
    ['nine', 'ninth', 'नौ', 'नौवां'],
    ['ten', 'tenth', 'दस', 'दसवां'],
  ];
  const contextPattern = / (?:this|the selected|selected|current) (?:road|street|section|segment)(?= )| (?:यह|ये|इस|यही|चुनी हुई) (?:सड़क|सडक|रोड|रास्ता|रास्ते|सेक्शन|हिस्सा)(?= )| (?:yeh|yah|ye|is|iss) (?:road|sadak|rasta|raasta|section)(?= )/gu;
  const unclearPattern = / (?:no|not|never|don t|do not|doesn t|isn t|aren t|wasn t|shouldn t|cannot|can t|won t|maybe|might|possible|possibly|may|could|perhaps|unsure|unconfirmed|uncertain|probably|if|whether|would|should|or|was|were|yesterday|tomorrow|नहीं|नही|मत|शायद|संभव|अगर|क्या|कल|था|थी|थे|tha|thi|thee|nahi|nahin|nhi|shayad|shaayad|agar|kya)(?= )/u;
  const closedPattern = / (?:close|closed|closure|block|blocked|impassable|flooded|waterlogged|underwater|under water|बंद|बन्द|ब्लॉक|जलमग्न|पानी में डूबी|पानी में डूबा|पानी भर गया|पानी भरा|band|bandh|paani bhar gaya|pani bhar gaya)(?= )/gu;
  const openPattern = / (?:open|opened|reopen|reopened|re open|re opened|passable|clear|cleared|खोल|खोलो|खुल|खुला|खुली|खुले|चालू|साफ़|साफ|kholo|khul|khula|khuli|chalu|chaalu)(?= )/gu;
  const reportWords = new Set(('please kindly is are has have been be to the it keep road section ' +
    'now again currently still reported report mark due because of from for by flooding floods flood ' +
    'water heavy rain traffic as all है हैं हे हो गया गई गए गयी अब अभी फिर से ' +
    'कर करिए कीजिए करें करो करदो करदें करदे करदिए करदिया दो दें दीजिए कृपया को पर ' +
    'में के की वजह कारण यातायात केलिए hai hain he ho gaya gayi gyi ab abhi fir phir se ' +
    'kar karo kare karna karen kardo karwa do de dijiye ko par pe mein me vajah').split(' '));

  function normalize(text) {
    return text.normalize('NFC').toLowerCase()
      .replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x0966))
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  }

  function sectionNumber(token) {
    if (/^\d+(?:st|nd|rd|th)?$/.test(token)) return parseInt(token, 10);
    const index = sectionNumbers.findIndex(aliases => aliases.includes(token));
    return index < 0 ? null : index + 1;
  }

  const roadIndexes = new WeakMap();

  function getRoadIndex(roads) {
    if (roadIndexes.has(roads)) return roadIndexes.get(roads);
    const byName = new Map();
    roads.forEach((road, id) => {
      const name = normalize(road.name || road.label);
      const number = road.name ? road.label.match(/·\s*(\d+)$/)?.[1] : undefined;
      const candidates = byName.get(name) || [];
      candidates.push({ id, section: number ? Number(number) : null });
      byName.set(name, candidates);
    });
    const byAlias = new Map();
    for (const [name, candidates] of byName) {
      const localNumber = name.match(/^local road (\d+)$/)?.[1];
      const aliases = [name, ...(translatedRoads.get(name) || [])];
      if (localNumber) {
        for (const localName of ['local road', ...translatedRoads.get('local road')]) {
          for (const number of [localNumber, ...(sectionNumbers[Number(localNumber) - 1] || [])]) {
            aliases.push(localName + ' ' + number);
          }
        }
      }
      for (const alias of aliases) byAlias.set(normalize(alias), candidates);
    }
    const aliases = [...byAlias.keys()].sort((a, b) => b.length - a.length)
      .map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = aliases.length ? new RegExp(' (' + aliases.join('|') + ')(?= )', 'gu') : null;
    const index = { byAlias, pattern };
    roadIndexes.set(roads, index);
    return index;
  }

  function parseFieldReport(text, roads, selected) {
    const phrase = normalize(text);
    if (!phrase) return { kind: 'empty' };
    let remaining = ' ' + phrase + ' ';
    if (/[?？]/u.test(text) || unclearPattern.test(remaining) ||
        /^ (?:is|are|can|do|does|will|has|have) /u.test(remaining)) {
      return { kind: 'unclear-status' };
    }
    const { byAlias, pattern } = getRoadIndex(roads);
    const hits = pattern ? [...remaining.matchAll(pattern)] : [];
    const contexts = [...remaining.matchAll(contextPattern)];
    if (hits.length + contexts.length > 1) {
      return { kind: 'ambiguous-road', labels: [...new Set(hits.flatMap(hit => byAlias.get(hit[1]).map(({ id }) => roads[id].label)))] };
    }

    let roadId;
    let candidates = [];
    if (hits.length) {
      const [hit] = hits;
      const end = hit.index + hit[0].length;
      let tail = remaining.slice(end);
      candidates = byAlias.get(hit[1]);
      const section = tail.match(/^ (?:(section|segment|part|number|सेक्शन|खंड|हिस्सा|नंबर) )?([^ ]+)(?= )/u);
      const number = section ? sectionNumber(section[2]) : null;
      if (number !== null) {
        candidates = candidates.filter(candidate => candidate.section === number);
        tail = tail.slice(section[0].length);
      } else if (section?.[1]) {
        candidates = [];
      }
      if (candidates.length === 1) roadId = candidates[0].id;
      remaining = remaining.slice(0, hit.index) + ' ' + tail;
    } else if (contexts.length && roads[selected]) {
      const [context] = contexts;
      const end = context.index + context[0].length;
      roadId = selected;
      remaining = remaining.slice(0, context.index) + ' ' + remaining.slice(end);
    }

    const closed = closedPattern.test(remaining);
    closedPattern.lastIndex = 0;
    const open = openPattern.test(remaining);
    openPattern.lastIndex = 0;
    if (closed === open) return { kind: 'unclear-status' };
    if (candidates.length > 1) {
      return { kind: 'ambiguous-road', labels: candidates.map(({ id }) => roads[id].label) };
    }
    if (roadId === undefined) return { kind: 'unknown-road' };

    const rest = remaining.replace(closedPattern, ' ').replace(openPattern, ' ').trim();
    if (rest.split(' ').some(word => word && !reportWords.has(word))) return { kind: 'unknown-road' };
    return { kind: 'review', roadId, closed };
  }

  function installFieldReports({
    roads, getSelected, isClosed, selectRoad, applyReport, announce,
    document = globalThis.document, speech = globalThis,
  }) {
    const input = document.getElementById('report-text');
    const parseButton = document.getElementById('parse-report');
    const mic = document.getElementById('mic');
    const language = document.getElementById('language');
    const message = document.getElementById('voice-msg');
    const recognitionApi = speech.SpeechRecognition || speech.webkitSpeechRecognition;
    const panel = document.createElement('div');
    const confirm = document.createElement('button');
    const cancel = document.createElement('button');
    const defaultMicText = mic.textContent;
    const fallback = 'Microphone unavailable. Type a field report and select ' + parseButton.textContent.trim() + '.';
    const responses = {
      empty: 'Enter a field report first.',
      'unclear-status': 'Use a definite status such as “this road is flooded” or “this road is open”.',
      'unknown-road': 'Use the exact map label, or select the intended section and say “this road”.',
    };
    let pending = null;
    let recognition = null;

    panel.id = 'report-confirmation';
    panel.className = 'report-confirmation';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Confirm field report');
    confirm.id = 'confirm-report';
    confirm.type = cancel.type = 'button';
    cancel.id = 'cancel-report';
    cancel.textContent = 'Cancel';
    panel.hidden = true;
    panel.append(confirm, cancel);
    message.after(panel);

    function clearReview() {
      pending = null;
      panel.hidden = true;
    }

    function finishListening() {
      recognition = null;
      mic.disabled = false;
      mic.textContent = defaultMicText;
      mic.removeAttribute?.('aria-busy');
    }

    function stopListening() {
      const session = recognition;
      if (session) {
        finishListening();
        session.abort();
      }
    }

    function reset() {
      stopListening();
      clearReview();
      announce('');
    }

    function review(transcript, fromSpeech = false) {
      clearReview();
      const result = parseFieldReport(transcript, roads, getSelected());
      const heard = fromSpeech ? 'Heard “' + transcript.trim() + '”. ' : '';
      if (result.kind === 'ambiguous-road') {
        const labels = result.labels?.length ? ' (' + result.labels.join(', ') + ')' : '';
        announce(heard + 'Specify one exact road section' + labels + ', or select the section and use “this road”.');
        return;
      }
      if (result.kind !== 'review') {
        announce(heard + responses[result.kind]);
        return;
      }
      const label = roads[result.roadId].label;
      const status = result.closed ? 'closed' : 'open';
      if (isClosed(result.roadId) === result.closed) {
        announce(heard + label + ' is already ' + status + '.');
        return;
      }
      selectRoad(result.roadId);
      pending = { ...result, transcript: input.value };
      confirm.textContent = result.closed ? 'Confirm closure' : 'Confirm reopening';
      panel.hidden = false;
      announce(heard + 'Mark ' + label + ' ' + status + '?');
    }

    confirm.addEventListener('click', () => {
      if (!pending) return;
      const { roadId, closed, transcript } = pending;
      clearReview();
      if (getSelected() !== roadId || transcript !== input.value) {
        announce('Selection or report changed. Review the report again.');
        return;
      }
      const status = closed ? 'closed' : 'open';
      if (isClosed(roadId) !== closed) {
        applyReport(roadId, closed);
        announce(roads[roadId].label + ' marked ' + status + '.');
      } else {
        announce(roads[roadId].label + ' is already ' + status + '.');
      }
      input.focus();
    });

    cancel.addEventListener('click', () => {
      reset();
      announce('Report canceled.');
      input.focus();
    });
    input.addEventListener('input', reset);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      parseButton.click();
    });
    parseButton.addEventListener('click', () => {
      stopListening();
      review(input.value);
    });

    if (!recognitionApi) announce(fallback);
    mic.addEventListener('click', () => {
      if (!recognitionApi) {
        announce(fallback);
        input.focus();
        return;
      }
      if (recognition) return;
      clearReview();
      try {
        const session = new recognitionApi();
        recognition = session;
        session.lang = language.value;
        session.continuous = false;
        session.interimResults = false;
        const selectedAtStart = getSelected();
        session.onresult = event => {
          if (recognition !== session) return;
          const transcript = event.results[event.resultIndex || 0][0].transcript;
          input.value = transcript;
          if (getSelected() !== selectedAtStart) {
            announce('Heard “' + transcript + '”. Selection changed. Review the report again.');
            return;
          }
          review(transcript, true);
        };
        session.onerror = event => {
          if (recognition !== session) return;
          finishListening();
          if (event.error === 'no-speech') announce('No speech detected. Try again or type the report.');
          else if (event.error !== 'aborted') announce(fallback);
        };
        session.onend = () => {
          if (recognition === session) finishListening();
        };
        mic.disabled = true;
        mic.textContent = 'Listening…';
        mic.setAttribute('aria-busy', 'true');
        announce('Say the road label or “this road” and whether it is blocked or open.');
        session.start();
      } catch {
        finishListening();
        announce(fallback);
      }
    });

    return { reset };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { parseFieldReport, installFieldReports };
  } else {
    globalThis.installFieldReports = installFieldReports;
  }
})();
