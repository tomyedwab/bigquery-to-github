function getParameterByName(name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}

$(function() {
    var code = getParameterByName("code");
    var state = getParameterByName("state");

    chrome.runtime.sendMessage({
        type: "completeLoginToGitHub",
        code: code,
        state: state
    });
    close();
});
