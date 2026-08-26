(function() {
    var dataEl = document.getElementById('video-frame-data');
    if (!dataEl) {
        return;
    }

    var videoInfo;
    try {
        videoInfo = JSON.parse(dataEl.textContent || dataEl.innerText || 'null');
    } catch (e) {
        videoInfo = null;
    }
    if (!videoInfo) {
        return;
    }

    var video = document.getElementById('annotate-video');
    var allFrames = videoInfo.frames || []; // [{FrameNumber, TimestampSec, IName}, ...] ordered by FrameNumber
    var extractedFrames = allFrames.filter(function(f) { return f.IName; });
    var extractedTimestamps = extractedFrames.map(function(f) { return f.TimestampSec; });

    var PName = $("input[name='PName']").val();
    var Admin = $("input[name='Admin']").val();

    var currentIName = $("input[name='IName']").val();
    var currentIdx = extractedFrames.findIndex(function(f) { return f.IName === currentIName; });
    if (currentIdx === -1) {
        currentIdx = 0;
    }

    // Lower-bound binary search: first index whose timestamp is >= t.
    function lowerBound(arr, t) {
        var lo = 0, hi = arr.length - 1;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (arr[mid] < t) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    function nearestExtractedIndexForTime(t) {
        if (extractedFrames.length === 0) {
            return -1;
        }
        return lowerBound(extractedTimestamps, t);
    }

    function fetchFrame(iName) {
        var url = '/api/annotate/frame?PName=' + encodeURIComponent(PName) +
            '&Admin=' + encodeURIComponent(Admin) +
            '&IName=' + encodeURIComponent(iName);
        return fetch(url).then(function(r) { return r.json(); });
    }

    function saveCurrentFrameAjax() {
        if (!window.AutoSaveEnabled) {
            return Promise.resolve();
        }
        var form = document.getElementById('submit-project');
        var formData = new FormData(form);
        formData.append('ajax', '1');
        return fetch('/updateLabels', {
            method: 'POST',
            body: new URLSearchParams(formData),
        });
    }

    function updateFrameLabel() {
        var text = '-';
        if (extractedFrames.length > 0 && currentIdx >= 0) {
            text = extractedFrames[currentIdx].IName + ' (' + (currentIdx + 1) + ' / ' + extractedFrames.length + ')';
        }
        $('#video-frame-label').text(text);
    }

    function formatTime(sec) {
        if (!Number.isFinite(sec)) {
            return '0:00';
        }
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateTimeLabel() {
        $('#video-time-label').text(formatTime(video.currentTime) + ' / ' + formatTime(video.duration));
    }

    function goToExtractedIndex(idx) {
        if (idx < 0 || idx >= extractedFrames.length || idx === currentIdx) {
            return;
        }
        var target = extractedFrames[idx];

        saveCurrentFrameAjax()
            .then(function() { return fetchFrame(target.IName); })
            .then(function(data) {
                if (!data || !data.success) {
                    return;
                }
                window.renderAnnotateFrame(data.imagePath, data.IName, data.labels, data.reviewImage);
                currentIdx = idx;
                video.currentTime = target.TimestampSec;
                updateFrameLabel();
            });
    }

    updateFrameLabel();

    $('#video-step-prev').on('click', function() {
        video.pause();
        goToExtractedIndex(currentIdx - 1);
    });
    $('#video-step-next').on('click', function() {
        video.pause();
        goToExtractedIndex(currentIdx + 1);
    });
    $('#video-play-pause').on('click', function() {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    });


    function syncVideoDimensionsToCanvas() {
        if (!canvas) {
            return;
        }
        video.width = canvas.getWidth();
        video.height = canvas.getHeight();
        $('#video-controls').css('width', canvas.getWidth());
    }
    syncVideoDimensionsToCanvas();
    $(window).on('resize', syncVideoDimensionsToCanvas);


    video.addEventListener('play', function() {
        $('#video-play-pause').text('Pause');
    });
    video.addEventListener('pause', function() {
        $('#video-play-pause').text('Play');
        var idx = nearestExtractedIndexForTime(video.currentTime);
        goToExtractedIndex(idx);
    });

    $('#video-scrub').on('input', function() {
        video.pause();
        video.currentTime = parseFloat($(this).val());
        updateTimeLabel();
    });

    function setScrubMax() {
        if (video.duration) {
            $('#video-scrub').attr('max', video.duration);
        }
        updateTimeLabel();
    }
    setScrubMax();
    video.addEventListener('loadedmetadata', setScrubMax);

    function onFrameTick(now, metadata) {
        var t = metadata ? metadata.mediaTime : video.currentTime;
        $('#video-scrub').val(t);
        updateTimeLabel();
        video.requestVideoFrameCallback(onFrameTick);
    }
    if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(onFrameTick);
    } else {
        video.addEventListener('timeupdate', function() {
            $('#video-scrub').val(video.currentTime);
            updateTimeLabel();
        });
    }
})();
