/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
// Automatically selects English audio when streaming online.
// Falls back to Japanese if no English track is found.

var EN_LANGS  = ["en", "eng", "en-us", "en-gb", "english"];
var EN_LABELS = ["english", "dub", "eng", "dubbed", "en"];

function isEnglish(lang, label) {
    var l = lang.toLowerCase().trim();
    var b = label.toLowerCase().trim();
    for (var i = 0; i < EN_LANGS.length; i++) {
        if (l === EN_LANGS[i] || l.indexOf(EN_LANGS[i] + "-") === 0) return true;
    }
    for (var j = 0; j < EN_LABELS.length; j++) {
        if (b === EN_LABELS[j] || b.indexOf(EN_LABELS[j]) !== -1) return true;
    }
    return false;
}

function findEnglishTrack(tracks) {
    if (!tracks) return null;

    var arr = [];
    if (Array.isArray(tracks)) {
        arr = tracks;
    } else if (typeof tracks.length === "number") {
        for (var i = 0; i < tracks.length; i++) arr.push(tracks[i]);
    } else {
        var keys = Object.keys(tracks);
        for (var k = 0; k < keys.length; k++) arr.push(tracks[keys[k]]);
    }

    for (var t = 0; t < arr.length; t++) {
        var track = arr[t];
        if (!track) continue;
        var lang  = String(track.language || track.lang  || track.Language || "");
        var label = String(track.label    || track.Label || track.name     || track.Name || "");
        if (isEnglish(lang, label)) {
            var id = track.id    !== undefined ? Number(track.id)    :
                     track.index !== undefined ? Number(track.index) : t;
            return { id: id };
        }
    }
    return null;
}

function extractAudioTracks(event) {
    if (!event) return null;
    var candidates = [
        event.audioTracks,
        event.AudioTracks,
        event.detail  && event.detail.audioTracks,
        event.data    && event.data.audioTracks,
        event.payload && event.payload.audioTracks,
        event.tracks,
    ];
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (c && (c.length > 0 || Object.keys(c).length > 0)) return c;
    }
    return null;
}

function init() {
    $ui.register(function (ctx) {

        var appliedThisEpisode = ctx.state(false);

        function tryApplyFromEvent(event) {
            var rawTracks = extractAudioTracks(event);
            if (!rawTracks) return false;

            var enTrack = findEnglishTrack(rawTracks);
            if (!enTrack) {
                ctx.videoCore.showMessage("Playing Japanese audio (no EN track found)", 3000);
                appliedThisEpisode.set(true);
                return false;
            }

            ctx.videoCore.setAudioTrack(enTrack.id);
            ctx.videoCore.showMessage("Switched to English audio", 3000);
            appliedThisEpisode.set(true);
            return true;
        }

        // PRIMARY: fires when HLS manifest + tracks are parsed
        ctx.videoCore.addEventListener("video-loaded-metadata", function (event) {
            appliedThisEpisode.set(false);
            var playbackType = ctx.videoCore.getCurrentPlaybackType();
            if (playbackType !== "onlinestream") return;
            tryApplyFromEvent(event);
        });

        // FALLBACK: fires ~500ms later, HLS tracks more likely available
        ctx.videoCore.addEventListener("video-can-play", function (event) {
            if (appliedThisEpisode.get()) return;
            var playbackType = ctx.videoCore.getCurrentPlaybackType();
            if (playbackType !== "onlinestream") return;
            tryApplyFromEvent(event);
        });

        // Reset on new video load
        ctx.videoCore.addEventListener("video-loaded", function (_event) {
            appliedThisEpisode.set(false);
        });
    });
}

