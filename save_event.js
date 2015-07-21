var gitHubToken = null;
var gitHubRepo = null;
var gitHubDir = null;

// Load token & repo from synced storage on startup
chrome.storage.sync.get(["gitHubToken", "gitHubRepo", "gitHubDir"],
    function(data) {
        if (!data) {
            return;
        }
        gitHubToken = gitHubToken || data.gitHubToken || null;
        gitHubRepo = gitHubRepo || data.gitHubRepo || null;
        gitHubDir = gitHubDir || data.gitHubDir || null;
    });

var gitHubLoginState = null;
var gitHubLoginDeferred = null;

var gitHubRedirectUri = "chrome-extension://" +
    chrome.i18n.getMessage("@@extension_id") +
    "/auth.html";

function login() {
    gitHubLoginDeferred = $.Deferred();

    // Create a random string to protect against XSS
    gitHubLoginState = (""+Math.random()).substring(2);

    chrome.tabs.create({
        url: "https://github.com/login/oauth/authorize" +
            "?client_id=" +
            gitHubClientId +
            "&redirect_uri=" +
            gitHubRedirectUri +
            "&scope=repo&state=" +
            gitHubLoginState
    });

    return gitHubLoginDeferred;
};

function completeLogin(code, state) {
    if (gitHubLoginDeferred === null ||
        state !== gitHubLoginState) {
        return;
    }

    // Exchange the code for an auth token
    $.ajax({
        url: "https://github.com/login/oauth/access_token" +
            "?client_id=" +
            gitHubClientId +
            "&client_secret=" +
            gitHubClientSecret +
            "&code=" +
            code +
            "&redirect_uri=" +
            gitHubRedirectUri,
        method: "POST",
        headers: {
            Accept: "application/json"
        }
    }).then(function(resp) {
        gitHubToken = resp.access_token;

        chrome.storage.sync.set({
            gitHubToken: gitHubToken
        });

        gitHubLoginDeferred.resolve();
        gitHubLoginDeferred = null;
    }, function(xhr) {
        gitHubLoginDeferred.reject(xhr);
        gitHubLoginDeferred = null;
    });
};

function logout() {
    // Some error happened; reset login information
    gitHubToken = null;
    chrome.storage.sync.set({
        gitHubToken: null
    });
};

function getRootCommitAndTree(repo) {
    return $.ajax({
        url: "https://api.github.com/repos/" + repo +
            "/git/refs/heads/master",
        headers: {"Authorization": "Token " + gitHubToken}
    }).then(function(resp) {
        return $.ajax({
            url: "https://api.github.com/repos/" + repo +
                "/git/commits/" + resp.object.sha,
            headers: {"Authorization": "Token " + gitHubToken}
        });
    }).then(function(resp) {
        return {
            commitSha: resp.sha,
            treeSha: resp.tree.sha
        };
    });
};

function createFile(repo, path, name, content) {
    
    var newBlobSha = null;
    var parentCommit = null;

    // Create the blob
    return getRootCommitAndTree(repo).then(function(commitAndTree) {
        parentCommit = commitAndTree.commitSha;

        return $.ajax({
            url: "https://api.github.com/repos/" + repo + "/git/trees",
            headers: {"Authorization": "Token " + gitHubToken},
            method: "POST",
            data: JSON.stringify({
                "base_tree": commitAndTree.treeSha,
                "tree": [{
                    "path": path + "/" + name,
                    "mode": "100644",
                    "type": "blob",
                    "content": content,
                    "encoding": "utf-8"
                }]
            })
        });
    }).then(function(resp) {
        var newTreeSha = resp.sha;

        return $.ajax({
            url: "https://api.github.com/repos/" + repo + "/git/commits",
            headers: {"Authorization": "Token " + gitHubToken},
            method: "POST",
            data: JSON.stringify({
                message: "Saved " + path + "/" + name + " from BigQuery.",
                parents: [parentCommit],
                tree: newTreeSha
            })
        });
    }).then(function(resp) {
        var newCommitSha = resp.sha;

        return $.ajax({
            url: "https://api.github.com/repos/" + repo + "/git/refs/" +
                "heads/master",
            headers: {"Authorization": "Token " + gitHubToken},
            method: "POST",
            data: JSON.stringify({
                sha: newCommitSha
            })
        });
    });
};

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.type && request.type === "checkGitHubLogin") {
            sendResponse({
                loggedIn: gitHubToken !== null,
                defaultRepo: gitHubRepo,
                defaultDir: gitHubDir
            });
        }

        if (request.type && request.type === "loginToGitHub") {
            login().then(
                function() {
                    chrome.tabs.sendMessage(
                        sender.tab.id, {type: "loggedInToGitHub"});
                }, function(xhr) {
                    logout();
                    chrome.tabs.sendMessage(
                        sender.tab.id, {
                            type: "loginToGitHubError",
                            message: xhr.responseText
                        });
                });
            sendResponse();
        }

        if (request.type && request.type === "saveToGitHub" &&
                gitHubToken !== null) {
            createFile(request.repo, request.path, request.name,
                    request.content).then(
                function() {
                    // Update default repo on success
                    gitHubRepo = request.repo;
                    gitHubDir = request.path;
                    chrome.storage.sync.set({
                        gitHubRepo: gitHubRepo,
                        gitHubDir: gitHubDir
                    });

                    chrome.tabs.sendMessage(
                        sender.tab.id, {type: "savedToGitHub"});
                }, function(xhr) {
                    logout();
                    chrome.tabs.sendMessage(
                        sender.tab.id, {
                            type: "saveToGitHubError",
                            message: xhr.responseText
                        });
                });

            sendResponse();
        }

        if (request.type && request.type === "completeLoginToGitHub") {
            completeLogin(request.code, request.state);
            sendResponse();
        }
    });
