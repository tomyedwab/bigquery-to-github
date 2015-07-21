// TODO(tom) "Log out" button?

var saveToGitHubButton = null;
var saveToGitHubOptions = null;

var sendState = null;

var validRepos = [];
var invalidRepos = [];

// Injected code for the source page to watch for changes to the CodeMirror
// doc and respond to requests for scraping from this script.
var injectedCode = (
    "(function() {" +
    "  var doc = null;" + 
    "  window.CodeMirror.defineInitHook(function(cm) {" +
    "    doc = cm.doc;" +
    "  });" +
    "  window.addEventListener('message', function(event) {" +
    "    if (event.data === 'bigquery-to-github:scrape!') {" +
    "      window.postMessage({" +
    "        type: 'bigquery-to-github:content'," +
    "        text: doc.getValue()" +
    "      }, '*');" +
    "    }" +
    "  });" +
    "})();"
);

$(document).ready(function() {
    createButton();

    // Inject the script above into the source page
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.appendChild(document.createTextNode(injectedCode));
    document.body.appendChild(s);

    // Poll twice a second for whether the query view is visible
    setInterval(function() {
        var buttonBar = $("#query-button-bar");
        if (buttonBar.size() > 0) {
            if (buttonBar.find("#saveToGitHubButton").size() === 0) {
                saveToGitHubButton.insertAfter(buttonBar.find("#view-save"));
            }
        }
    }, 500);
});

function validate() {
    var repo = $("#github-repo").val();
    var path = $("#github-path").val();
    var name = $("#github-name").val();
    var title = $("#github-title").val();
    var description = $("#github-description").val();

    var repoIsValid = false;
    var fileIsValid = false;

    if (repo !== "" && repo.split("/").length === 2) {
        if (validRepos.indexOf(repo) !== -1) {
            repoIsValid = true;
            // Show a green check mark
            $(".validator-valid", saveToGitHubOptions).css({display:"inline-block"});
            $(".validator-invalid", saveToGitHubOptions).css({display:"none"});

        } else if (invalidRepos.indexOf(repo) !== -1) {
            // Show a red exclamation mark
            $(".validator-valid", saveToGitHubOptions).css({display:"none"});
            $(".validator-invalid", saveToGitHubOptions).css({display:"inline-block"});

        } else {
            $(".validator-valid", saveToGitHubOptions).css({display:"none"});
            $(".validator-invalid", saveToGitHubOptions).css({display:"none"});

            chrome.runtime.sendMessage({
                type: "checkGitHubRepo",
                repo: repo
            });
        }
    }

    if (path !== "" && name !== "" && title !== "" && description !== "") {
        fileIsValid = true;
    }

    if (repoIsValid && fileIsValid && sendState === null) {
        // Can save
        $(".wizard-submit-button", saveToGitHubOptions).removeClass(
            "jfk-button-disabled");
        return {
            repo: repo,
            path: path,
            name: name,
            title: title,
            description: description
        };
    } else {
        // Cannot save
        $(".wizard-submit-button", saveToGitHubOptions).addClass(
            "jfk-button-disabled");
        return null;
    }
}

function createButton() {
    saveToGitHubButton = $('<div id="saveToGitHubButton" class="goog-inline-block jfk-button jfk-button-standard" role="button" style="-webkit-user-select: none;" tabindex="0">Save Query to GitHub</div>');
    saveToGitHubButton.click(function() {
        if (sendState !== null) {
            // We're already saving something.
            return;
        }

        chrome.runtime.sendMessage({
            type: "checkGitHubLogin"
        }, function(info) {
            if (info.loggedIn) {
                saveToGitHubOptions.show();
                $("#github-repo", saveToGitHubOptions).val(info.defaultRepo);
                $("#github-path", saveToGitHubOptions).val(info.defaultDir);
                $("#github-name", saveToGitHubOptions).val("");
                $("#github-title", saveToGitHubOptions).val("");
                $("#github-description", saveToGitHubOptions).val("");
                validate();
            } else {
                $(".error", loginToGitHubOptions).html("");
                loginToGitHubOptions.show();
            }
        });

    });

    loginToGitHubOptions = $(
        '<div class="goog-modalpopup modal-dialog wizard-dialog" ' +
            'tabindex="0" style="width:670px; height: 260px; left: 50%; ' +
            'margin-left: -335px; display: none">' +
          '<div class="modal-dialog-title">' + 
            '<span id="wizard-title" class="modal-dialog-title-text">' +
              'Log in to GitHub</span>' + 
            '<span class="modal-dialog-title-close"></span>' +
          '</div>' +
          '<div style="position: absolute; right: 42px; left: 42px; ' +
              'height: 454px">' +
            '<article class="wizard-step">' +
              'In order to save to GitHub, please authenticate with your ' +
              'GitHub account.' +
              '<div class="error" style="color: red"></div>' +
            '</article>' +
          '</div>' +
          '<div style="position: absolute; right: 42px; bottom: 30px; ' +
              'left: 42px; margin-top: 10px;">' +
            '<div role="button" class="goog-inline-block jfk-button ' +
              'jfk-button-action wizard-submit-button">Log In</div>' +
            '<div role="button" class="goog-inline-block jfk-button ' +
              'jfk-button-standard wizard-cancel-button" ' +
              'style="float: right; margin-right: 0px">Cancel</div>' +
          '</div>' +
        '</div>');
    $(".modal-dialog-title-close", loginToGitHubOptions).click(function() {
        loginToGitHubOptions.hide();
    });
    $(".wizard-cancel-button", loginToGitHubOptions).click(function() {
        loginToGitHubOptions.hide();
    });
    $(".wizard-submit-button", loginToGitHubOptions).click(function() {
        chrome.runtime.sendMessage({
            type: "loginToGitHub"
        });
    });
    $("body").append(loginToGitHubOptions);

    saveToGitHubOptions = $(
        '<div class="goog-modalpopup modal-dialog wizard-dialog" ' +
            'tabindex="0" style="width:670px; height: 260px; left: 50%; ' +
            'margin-left: -335px; display: none">' +
          '<div class="modal-dialog-title">' + 
            '<span id="wizard-title" class="modal-dialog-title-text">' +
              'Save to GitHub</span>' + 
            '<span class="modal-dialog-title-close"></span>' +
          '</div>' +
          '<div style="position: absolute; right: 42px; left: 42px; ' +
              'height: 454px">' +
            '<article class="wizard-step">' +
              '<table><tbody>' +
                '<tr><th>Repository</th><td><input id="github-repo" ' +
                  'type="text" class="jfk-textinput"' +
                  'placeholder="owner/repo">' +
                  '<div id="validator-indicator" class="validator-bubble validator-invalid" style="display:none"><div class="validator-symbol goog-inline-block">!</div></div>' +
                  '<div id="validator-indicator" class="validator-bubble validator-valid" style="display:none"><div class="validator-symbol goog-inline-block">&#x2713;</div></div>' +
                  '</td></tr>' +
                '<tr><th>Path</th><td><input id="github-path" ' +
                  'type="text" class="jfk-textinput"' +
                  'placeholder="path/to/file"></td></tr>' +
                '<tr><th>Filename</th><td><input id="github-name" ' +
                  'type="text" class="jfk-textinput"' +
                  'placeholder="filename (w/o extension)"></td></tr>' +
                '<tr><th>Title</th><td><input id="github-title" ' +
                  'type="text" class="jfk-textinput"></td></tr>' +
                '<tr><th>Description</th><td><input id="github-description" ' +
                  'type="text" class="jfk-textinput"></td></tr>' +
              '</tbody></table>' +
            '</article>' +
          '</div>' +
          '<div style="position: absolute; right: 42px; bottom: 30px; ' +
              'left: 42px; margin-top: 10px;">' +
            '<div role="button" class="goog-inline-block jfk-button ' +
              'jfk-button-action wizard-submit-button">Save</div>' +
            '<div role="button" class="goog-inline-block jfk-button ' +
              'jfk-button-standard wizard-cancel-button" ' +
              'style="float: right; margin-right: 0px">Cancel</div>' +
          '</div>' +
        '</div>');
    saveToGitHubOptions.delegate("input", "keyup", function() {
        validate();
    });
    $(".modal-dialog-title-close", saveToGitHubOptions).click(function() {
        saveToGitHubOptions.hide();
    });
    $(".wizard-cancel-button", saveToGitHubOptions).click(function() {
        saveToGitHubOptions.hide();
    });
    $(".wizard-submit-button", saveToGitHubOptions).click(function() {
        var params = validate();
        if (params) {
            saveToGitHub(params.repo, params.path, params.name, params.title,
                params.description);
        }
    });
    $("body").append(saveToGitHubOptions);
}

var _scrapeResultsHandler = null;

window.addEventListener('message', function(event) {
    if (event.data.type && event.data.type === "bigquery-to-github:content" &&
        _scrapeResultsHandler) {
        _scrapeResultsHandler(event.data.text);
    }
});

function saveToGitHub(repo, path, name, title, description) {
    // TODO(tom): Linting of path & name
    
    // Set a handler that the injected JS on the page will talk to via the
    // message handler above
    _scrapeResultsHandler = function(queryText) {
        var text = [
            '// Title: ', title, "\n",
            '// Description: ', description, "\n\n",
            queryText
        ];
        var finalText = text.join("");

        saveToGitHubButton.addClass("jfk-button-disabled");
        sendState = "sending";

        chrome.runtime.sendMessage({
            type: "saveToGitHub",
            content: finalText,
            repo: repo,
            path: path,
            name: name + '.sql',
            title: title,
            description: description
        });

        _scrapeResultsHandler = null;
    }

    // Post the message to the source page asking for a scrape of the currently
    // open document
    window.postMessage("bigquery-to-github:scrape!", "*");
}

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.type && request.type === "loggedInToGitHub") {
            loginToGitHubOptions.hide();
            saveToGitHubOptions.show();
        }

        if (request.type && request.type === "loginToGitHubError") {
            $(".error", loginToGitHubOptions).html(
                "Error logging in: " + request.message);
        }

        if (request.type && request.type === "savedToGitHub") {
            saveToGitHubButton.removeClass("jfk-button-disabled");
            saveToGitHubOptions.hide();
            sendState = null;
        }

        if (request.type && request.type === "saveToGitHubError") {
            $(".error", loginToGitHubOptions).html(
                "Error saving query: " + request.message);
            saveToGitHubOptions.hide();
            loginToGitHubOptions.show();
        }

        if (request.type && request.type === "gitHubRepoValid") {
            if (request.valid) {
                validRepos.push(request.repo);
            } else {
                invalidRepos.push(request.repo);
            }
            validate();
        }
    });
