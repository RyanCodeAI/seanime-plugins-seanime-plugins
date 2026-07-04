/// <reference path="./plugin.d.ts" />

// Auto English Audio — Seanime Plugin
// Strategy:
//  1. Always set track 0 immediately (EN is typically track 0 when dub exists)
//  2. After 700ms, try getPlaybackState() / getCurrentPlaybackInfo() to verify language
//  3. If verified EN  → subtitles OFF
//  4. If verified JA or unverifiable → enable English subtitles ON
//  5. Event listeners are kept as bonus — if any fire they shortcut the timer logic

function init() {
    $ui.register(function(ctx) {

        var done     = false;
        var masterTick = 0;
        var startTick  = -1;

        // ── helpers ────────────────────────────────────────────────────────
        function isEnglish(lang, label) {
            var l = (lang  || "").toLowerCase().trim();
            var b = (label || "").toLowerCase().trim();
            return l === "en" || l === "eng" || l.indexOf("en-") === 0 ||
                   b === "english" || b === "dub" || b === "dubbed" ||
                   b.indexOf("english") !== -1 || b.indexOf("dub") !== -1;
        }

        function getEnglishSubIndex() {
            try {
                var tracks = ctx.videoCore.getTextTracks();
                if (!tracks || tracks.length === 0) return 0;
                for (var i = 0; i < tracks.length; i++) {
                    var lang  = String(tracks[i].language || tracks[i].lang  || "");
                    var label = String(tracks[i].label    || tracks[i].name  || "");
                    if (isEnglish(lang, label)) {
                        return typeof tracks[i].index === "number" ? tracks[i].index : i;
                    }
                }
                // Fallback: first track
                return typeof tracks[0].index === "number" ? tracks[0].index : 0;
            } catch(e) { return 0; }
        }

        function finishDub() {
            if (done) return;
            done = true;
            ctx.videoCore.setSubtitleTrack(-1);
            ctx.videoCore.showMessage("English dub — subtitles off", 3000);
        }
        function finishSub() {
            if (done) return;
            done = true;
            var idx = getEnglishSubIndex();
            ctx.videoCore.setSubtitleTrack(idx);
            ctx.videoCore.showMessage("No dub — English subtitles on (track " + idx + ")", 3000);
        }

        // Try to read current audio language from synchronous state methods
        function detectCurrentAudio() {
            var lang = "", label = "";
            try {
                var s = ctx.videoCore.getPlaybackState();
                var at = s && (s.audioTrack || s.currentAudioTrack ||
                         (s.playbackInfo && s.playbackInfo.audioTrack));
                if (at) {
                    lang  = String(at.language || at.lang  || "");
                    label = String(at.label    || at.name  || "");
                }
            } catch(e) {}
            if (!lang && !label) {
                try {
                    var pi = ctx.videoCore.getCurrentPlaybackInfo();
                    var at2 = pi && (pi.audioTrack || pi.currentAudioTrack);
                    if (at2) {
                        lang  = String(at2.language || at2.lang  || "");
                        label = String(at2.label    || at2.name  || "");
                    }
                } catch(e) {}
            }
            return { lang: lang, label: label };
        }

        // ── Event listeners (bonus shortcut if they fire) ──────────────────
        function onAudioEvent(event) {
            if (done || !event) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;

            // Try track list first (audio-tracks-updated)
            var list = event.audioTracks || event.AudioTracks || event.tracks;
            if (list) {
                var arr = Array.isArray(list) ? list : Object.values(list);
                for (var i = 0; i < arr.length; i++) {
                    var t  = arr[i];
                    var tl = String(t.lang || t.language || "");
                    var tb = String(t.name || t.label    || "");
                    if (isEnglish(tl, tb)) {
                        var id = typeof t.id    === "number" ? t.id    :
                                 typeof t.index === "number" ? t.index : i;
                        done = true;
                        ctx.videoCore.setAudioTrack(id);
                        ctx.videoCore.setSubtitleTrack(-1);
                        ctx.videoCore.showMessage("English dub — subtitles off", 3000);
                        return;
                    }
                }
                if (arr.length > 0) { finishSub(); return; }
            }

            // Single track response
            var lang  = String(event.language || event.lang  || "");
            var label = String(event.label    || event.name  || "");
            if (lang || label) {
                if (isEnglish(lang, label)) finishDub();
                else                        finishSub();
            }
        }

        var evts = [
            "audio-tracks-updated","audio-tracks","audio-track","audio-track-changed",
            "audio-track-switched","audio-track-loaded","current-audio-track","audiotrack",
            "hls-audio-tracks-updated","hlsAudioTracksUpdated","hlsAudioTrackSwitched"
        ];
        for (var ei = 0; ei < evts.length; ei++) {
            ctx.videoCore.addEventListener(evts[ei], onAudioEvent);
        }

        // ── Master timer ───────────────────────────────────────────────────
        ctx.setInterval(function() {
            masterTick++;
            if (done || startTick < 0) return;
            var elapsed = masterTick - startTick;

            // At ~700ms: try sync verification of current audio track
            if (elapsed === 1) {
                var cur = detectCurrentAudio();
                if (cur.lang || cur.label) {
                    if (isEnglish(cur.lang, cur.label)) finishDub();
                    else                                finishSub();
                    return;
                }
                // Sync methods gave nothing — rely on tick 2 fallback
                return;
            }

            // At ~1.4s: final fallback — assume subs needed
            // (setAudioTrack(0) was already called at start; if EN that's fine,
            //  if JA we correctly enable subs)
            if (elapsed === 2 && !done) {
                finishSub();
            }
        }, 700);

        // ── Video lifecycle ────────────────────────────────────────────────
        function reset() {
            done      = false;
            startTick = -1;
        }
        ctx.videoCore.addEventListener("video-loaded-metadata", reset);
        ctx.videoCore.addEventListener("video-loaded",          reset);

        ctx.videoCore.addEventListener("video-can-play", function() {
            if (done) return;
            if (ctx.videoCore.getCurrentPlaybackType() !== "onlinestream") return;

            startTick = masterTick;
            // Always try track 0 first (EN on dub providers, JA on sub-only)
            ctx.videoCore.setAudioTrack(0);
            // Also fire the event-based request in case it responds
            ctx.videoCore.sendGetAudioTrack();
        });
    });
}
