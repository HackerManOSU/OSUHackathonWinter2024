// Constants for musical notes
const C2 = 65.41; // C2 note, in Hz
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let testFrequencies = [];

// Populate test frequencies
for (let i = 0; i < 30; i++) {
    const noteFrequency = C2 * Math.pow(2, i / 12);
    const noteName = notes[i % 12];
    const note = { frequency: noteFrequency, name: noteName };
    const justAbove = { frequency: noteFrequency * Math.pow(2, 1 / 48), name: `${noteName} (sharp)` };
    const justBelow = { frequency: noteFrequency * Math.pow(2, -1 / 48), name: `${noteName} (flat)` };
    testFrequencies = testFrequencies.concat([justBelow, note, justAbove]);
}

// Initialize application
window.addEventListener("load", initialize);
const correlationWorker = new Worker("worker.js");
correlationWorker.addEventListener("message", interpretCorrelationResult);

function initialize() {
    const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    getUserMedia.call(navigator, { audio: true }, useStream, () => {});

    document.getElementById("play-note").addEventListener("click", togglePlayingNote);
}

function useStream(stream) {
    const audioContext = new AudioContext();
    const microphone = audioContext.createMediaStreamSource(stream);
    const scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1);

    scriptProcessor.connect(audioContext.destination);
    microphone.connect(scriptProcessor);

    let buffer = [];
    const sampleLengthMilliseconds = 100;
    let recording = true;

    window.captureAudio = (event) => {
        if (!recording) return;

        buffer = buffer.concat(Array.from(event.inputBuffer.getChannelData(0)));

        if (buffer.length > sampleLengthMilliseconds * audioContext.sampleRate / 1000) {
            recording = false;
            correlationWorker.postMessage({ timeseries: buffer, testFrequencies, sampleRate: audioContext.sampleRate });
            buffer = [];
            setTimeout(() => { recording = true; }, 250);
        }
    };

    scriptProcessor.onaudioprocess = window.captureAudio;
}

function interpretCorrelationResult({ data }) {
    const { frequencyAmplitudes } = data;
    const magnitudes = frequencyAmplitudes.map(([real, imaginary]) => real * real + imaginary * imaginary);
    let maximumIndex = -1;
    let maximumMagnitude = 0;

    magnitudes.forEach((magnitude, index) => {
        if (magnitude > maximumMagnitude) {
            maximumIndex = index;
            maximumMagnitude = magnitude;
        }
    });

    const averageMagnitude = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const confidence = maximumMagnitude / averageMagnitude;
    const confidenceThreshold = 10;

    if (confidence > confidenceThreshold) {
        const dominantFrequency = testFrequencies[maximumIndex];
        document.getElementById("note-name").textContent = dominantFrequency.name;
        document.getElementById("frequency").textContent = dominantFrequency.frequency.toFixed(2);
    }
}

// Audio context for playing notes
const noteContext = new AudioContext();
const noteNode = noteContext.createOscillator();
const gainNode = noteContext.createGain();
noteNode.frequency.value = C2 * Math.pow(2, 4 / 12); // E note frequency
gainNode.gain.value = 0;
noteNode.connect(gainNode);
gainNode.connect(noteContext.destination);
noteNode.start();

let playing = false;
function togglePlayingNote() {
    playing = !playing;
    gainNode.gain.value = playing ? 0.1 : 0;
}
