const { Octokit } = require("@octokit/rest");
const { App } = require("octokit");
require("dotenv").config();
const axios = require("axios");
const { saveUser } = require("../../database/controllers/user.controller.js");
const { getUserInfo, getUserRepositories } = require("./APICalls.js");

// instantiate Github App for event handling (webhooks)
const githubApp = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
  oauth: {
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
  },
  webhooks: { secret: process.env.GITHUB_APP_WEBHOOK_SECRET },
});

/**
 * Starts the authorization process with the GitHub OAuth system
 * @param {*} res Response to send back to the caller
 */
const githubAuth = (req, res) => {
  if (!process.env.GITHUB_AUTH_CLIENT_ID) {
    res.status(500).send("GitHub provider is not configured");
    return;
  }

  const scopes = ["user", "repo"];
  const url = `https://github.com/login/oauth/authorize?client_id=${
    process.env.GITHUB_AUTH_CLIENT_ID
  }&scope=${scopes.join(",")}`;

  res.redirect(url);
};

/**
 * Calls the GitHub API to get an access token from the OAuth code.
 * @param {*} code Code returned by the GitHub OAuth authorization API
 * @returns A json object with `access_token` and `errors`
 */
const requestAccessToken = async (code) => {
  try {
    const {
      data: { access_token },
    } = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_AUTH_CLIENT_ID,
        client_secret: process.env.GITHUB_AUTH_CLIENT_SECRET,
        code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    return {
      access_token,
      errors: [],
    };
  } catch (error) {
    return {
      access_token: "",
      errors: [error.message],
    };
  }
};

const handleOAuthCallback = async (req, res) => {
  const code = req.body.code ?? req.query.code;

  const { access_token: accessToken, errors: accessTokenErrors } =
    await requestAccessToken(code);
  if (accessTokenErrors.length > 0) {
    res.status(500).send(accessTokenErrors.join());
    return;
  }

  const octokit = new Octokit({ auth: `${accessToken}` });

  // Authenticated user details
  const { user_info: userInfo, errors: userInfoErrors } = await getUserInfo(
    octokit
  );
  if (userInfoErrors.length > 0) {
    res.status(500).send(userInfoErrors.join());
    return;
  }

  // Save user to database
  const savedUser = await saveUser(
    userInfo.login,
    userInfo.name,
    userInfo.email,
    userInfo.id,
    null
  );
  if (!savedUser) {
    res.status(500).send("Error saving user info");
    return;
  }

  // Public repos they maintain, administer, or own
  const { repositories, errors: repositoriesErrors } =
    await getUserRepositories(octokit);
  if (repositoriesErrors.length > 0) {
    res.status(500).send(repositoriesErrors.join());
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(200).json({
      userId: savedUser.id,
      name: savedUser.name,
      username: savedUser.login,
      email: savedUser.email,
      repos: repositories,
      provider: "github",
    });
  } else if (process.env.NODE_ENV === "development") {
    res.status(200).send(`
        <html>
        <head>
          <title>Repo List</title>
        </head>
        <body>
          <h1>Welcome ${savedUser.name}</h1>
          <h2>Username: ${savedUser.login}</h2>
          <h2>Email: ${savedUser.email}</h2>
          <form action="/api/repos-to-badge" method="post">
            <input type="hidden" name="provider" value="github">
            <input type="hidden" name="userId" value="${savedUser.id}">
            <h2>Select Repositories:</h2>
            ${repositories
              .map(
                (repo) => `
                <div>
                  <input type="checkbox" name="repos[]" value="${repo.id}">
                  <label for="${repo.id}">${repo.fullName}</label>
                </div>
              `
              )
              .join("")}
            <br>
            <input type="submit" value="Submit">
          </form>
        </body>
      </html>
    `);
  } else {
    res.status(500).send("Unknown process mode");
  }
};

/**
 * Sets up the provided Express app routes for GitLab
 * @param {*} app Express application instance
 */
const githubAuthCallback = (app) => {
  if (process.env.NODE_ENV === "production") {
    app.post("/api/callback/github", handleOAuthCallback);
  } else if (process.env.NODE_ENV === "development") {
    app.get("/api/callback/github", handleOAuthCallback);
  }
};

module.exports = {
  githubAuth,
  githubAuthCallback,
  githubApp,
};
