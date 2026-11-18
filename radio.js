(() => {
  const libraryUrl = 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js';
  const libraryIntegrity = 'sha384-nqyY8clHf93uBYFkgkACShMTuvE3U57yXSJaf0Ws+XgzcoUe6OB/1BiOfHqKOWeg';
  const modelUrl = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz';
  const modelIntegrity = 'sha384-eq22GjcvmxRBpqH/h4DNPIG+8QhLmcxbrpYcPpRLMTgr18q5NAErUYZR5HxRFSnP';
  const sampleRate = 16000;
  const maxSeconds = 25;
  const maxBytes = 10 * 1024 * 1024;
  let modelRequest;

  function deadline(promise, millis) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Speech recognition timed out')), millis);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function loadModel() {
    const library = document.createElement('script');
    library.src = libraryUrl;
    library.integrity = libraryIntegrity;
    library.crossOrigin = 'anonymous';
    const loaded = new Promise((resolve, reject) => {
      library.onload = resolve;
      library.onerror = () => reject(new Error('Could not load recognizer code'));
    });
    document.head.append(library);
    let objectUrl;
    try {
      const [, archive] = await deadline(Promise.all([
        loaded,
        fetch(modelUrl, { integrity: modelIntegrity, signal: AbortSignal.timeout(75000) }).then(response => {
          if (!response.ok) throw new Error('Could not download the model archive');
          return response.blob();
        }),
      ]), 75000);
      objectUrl = URL.createObjectURL(archive);
      const model = new Vosk.Model(objectUrl, -1);
      try {
        await deadline(new Promise((resolve, reject) => {
          model.on('load', event => {
            if (event.result) resolve();
            else reject(new Error('Recognizer could not open the model'));
          });
          model.on('error', () => reject(new Error('Recognizer could not open the model')));
        }), 30000);
        return model;
      } catch (error) {
        model.terminate();
        throw error;
      }
    } finally {
      library.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  function getModel() {
    modelRequest ??= loadModel().catch(error => {
      modelRequest = undefined;
      throw error;
    });
    return modelRequest;
  }

  async function readMono(bytes) {
    const context = new OfflineAudioContext(1, 1, sampleRate);
    const buffer = await context.decodeAudioData(bytes);
    if (buffer.duration > maxSeconds) throw new Error('Choose an English audio clip of 25 seconds or less.');
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const mixed = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const input = buffer.getChannelData(channel);
      for (let i = 0; i < input.length; i++) mixed[i] += input[i] / buffer.numberOfChannels;
    }
    return mixed;
  }

  function transcribe(model, samples) {
    const recognizer = new model.KaldiRecognizer(sampleRate);
    const recognized = new Promise((resolve, reject) => {
      const parts = [];
      let final = false;
      recognizer.on('error', error => reject(new Error(error?.error || 'Audio recognition failed')));
      recognizer.on('result', message => {
        if (message.result.text) parts.push(message.result.text);
        if (final) resolve(parts.join(' ').trim());
        else finish();
      });
      recognizer.on('partialresult', finish);
      function finish() {
        if (final) return;
        final = true;
        recognizer.retrieveFinalResult();
      }
      recognizer.acceptWaveformFloat(samples, sampleRate);
    });
    return deadline(recognized, 30000).finally(() => recognizer.remove());
  }

  function installRadioIntake({
    onTranscript, onStart, announce,
    sampleUrl = globalThis.MONSOON_RADIO_SAMPLE || './assets/radio/field-transmission.wav',
  }) {
    const sample = document.getElementById('radio-sample');
    const upload = document.getElementById('audio-upload');
    const status = document.getElementById('radio-status');
    const tell = announce || (text => { status.textContent = text; });
    let player;
    let attempt = 0;
    let busy = false;

    function setBusy(value) {
      busy = value;
      sample.disabled = value;
      if (upload) upload.disabled = value;
    }

    async function review(read) {
      if (busy) return;
      onStart?.();
      const current = ++attempt;
      setBusy(true);
      tell('Reading audio…');
      let phase = 'audio';
      try {
        const samples = await readMono(await read());
        if (current !== attempt) return;
        phase = 'model';
        tell('Preparing English recognition · first run downloads about 41 MB.');
        const model = await getModel();
        if (current !== attempt) return;
        phase = 'transcription';
        tell('Transcribing audio on this device…');
        const text = await transcribe(model, samples);
        if (current !== attempt) return;
        if (!text) {
          tell('No clear English speech was recognized. Try a shorter clip or type the report.');
          return;
        }
        tell('English transcript ready to review.');
        onTranscript(text);
      } catch (error) {
        if (current !== attempt) return;
        if (phase === 'model') tell('Could not load the English speech model. Retry with a network connection or type the report.');
        else if (phase === 'transcription') tell('Could not transcribe the clip. Try a short English recording or type the report.');
        else if (error.message.startsWith('Choose an English audio clip')) tell(error.message);
        else tell('Could not read the audio. Try a WAV or MP3 file, or type the report.');
      } finally {
        if (current === attempt) setBusy(false);
      }
    }

    sample.addEventListener('click', () => {
      if (busy) return;
      player ??= new Audio(sampleUrl);
      player.currentTime = 0;
      player.play().catch(() => {});
      review(async () => {
        const response = await fetch(sampleUrl, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Sample unavailable');
        return response.arrayBuffer();
      });
    });
    upload?.addEventListener('change', () => {
      const file = upload.files[0];
      upload.value = '';
      if (!file) return;
      if (file.size > maxBytes) {
        tell('Choose an audio file under 10 MB.');
        return;
      }
      review(() => file.arrayBuffer());
    });

    return {
      reset() {
        ++attempt;
        player?.pause();
        setBusy(false);
        tell('');
      },
    };
  }

  globalThis.installRadioIntake = installRadioIntake;
})();
