var gitHubToken = null;
var gitHubRepo = null;

// Load token & repo from synced storage on startup
chrome.storage.sync.get(["gitHubToken", "gitHubRepo"], function(data) {
    if (data && data.gitHubToken) {
        gitHubToken = data.gitHubToken;
    }
    if (data && data.gitHubRepo) {
        gitHubRepo = data.gitHubRepo;
    }
});

function login(username, password, repo) {
    return $.ajax({
        url: "https://api.github.com/authorizations/clients/" + gitHubClientId,
        headers: {"Authorization": "Basic " + btoa(username + ":" + password)},
        method: "PUT",
        data: "{\"scopes\": [\"repo\", \"user\"], \"note\": \"bigquery-to-github\", \"client_secret\": \"" + gitHubClientSecret + "\"}"
    }).then(function(resp) {
        gitHubToken = resp.token;
        gitHubRepo = repo;

        // Try loading the HEAD commit to validate the repository
        return getRootCommitAndTree();
    }).then(function(resp) {
        // Store credentials so we don't have to log in again
        chrome.storage.sync.set({
            gitHubToken: gitHubToken,
            gitHubRepo: gitHubRepo
        });
        return true;
    }, function(xhr) {
        // Invalid respository! We're still not logged in correctly.
        return xhr;
    });
};

function logout() {
    // Some error happened; reset login information
    gitHubToken = null;
    gitHubRepo = null;

    chrome.storage.sync.set({
        gitHubToken: gitHubToken,
        gitHubRepo: gitHubRepo
    });
};

function getRootCommitAndTree() {
    return $.ajax({
        url: "https://api.github.com/repos/" + gitHubRepo +
            "/git/refs/heads/master",
        headers: {"Authorization": "Token " + gitHubToken}
    }).then(function(resp) {
        return $.ajax({
            url: "https://api.github.com/repos/" + gitHubRepo +
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


function createFile(path, name, content) {
    
    var newBlobSha = null;
    var parentCommit = null;

    // Create the blob
    return getRootCommitAndTree().then(function(commitAndTree) {
        parentCommit = commitAndTree.commitSha;

        return $.ajax({
            url: "https://api.github.com/repos/" + gitHubRepo + "/git/trees",
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
            url: "https://api.github.com/repos/" + gitHubRepo + "/git/commits",
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
            url: "https://api.github.com/repos/" + gitHubRepo + "/git/refs/" +
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
            sendResponse(gitHubToken !== null && gitHubRepo !== null);
        }

        if (request.type && request.type === "loginToGitHub") {
            login(request.username, request.password, request.repo).then(
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
                gitHubToken !== null && gitHubRepo !== null) {
            createFile(request.dir, request.name, request.content).then(
                function() {
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
    });
