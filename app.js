const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

app.post("/register", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user 
      (username, name, password, gender)
     VALUES
      (
       '${username}',
       '${name}',
       '${hashedPassword}',
       '${gender}'
      )`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Authenticate middleware with JWT token

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { userId } = request;
  const selectUserQuery = `SELECT username, tweet, date_time FROM user NATURAL JOIN tweet WHERE user_id = ${userId}`;
  const userDetails = await database.get(selectUserQuery);
  response.send(selectUserQuery);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { followingUserId } = request;
  const selectUserQuery = `SELECT username FROM user NATURAL JOIN follower WHERE user_id = '${followingUserId}'`;
  const userDetails = await database.get(selectUserQuery);
  response.send({ userDetails });
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { followerUserId } = request;
  const selectUserQuery = `SELECT username FROM user NATURAL JOIN follower WHERE user_id = '${followerUserId}'`;
  const userDetails = await database.get(selectUserQuery);
  response.send(userDetails);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { tweetId } = request;
  const selectUserQuery = `SELECT tweet, date_time FROM tweet NATURAL JOIN follower WHERE follower_user_id = '${tweetId}'`;
  if (selectUserQuery !== null) {
    const userDetails = await database.get(selectUserQuery);
    response.send(userDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request;
    const selectUserQuery = `SELECT * FROM tweet NATURAL JOIN follower WHERE user_id = '${tweetId}'`;
    if (selectUserQuery !== null) {
      const userDetails = await database.get(selectUserQuery);
      response.send(userDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request;
    const selectUserQuery = `SELECT * FROM tweet NATURAL JOIN follower WHERE following_user_id = '${tweetId}'`;
    if (selectUserQuery !== null) {
      const userDetails = await database.get(selectUserQuery);
      response.send(userDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { userId } = request;
  const selectUserQuery = `SELECT tweet FROM tweet  WHERE user_id = '${userId}'`;
  const userDetails = await database.all(selectUserQuery);
  response.send(userDetails);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { tweet } = request.body;
  const addTweetQuery = `
    INSERT INTO
      tweet (tweet)
    VALUES
      (
        '${tweet}' 
      );`;
  const userDetails = await database.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request;
    const deleteTweetQuery = `
    DELETE FROM
      tweet  
    WHERE
      tweet_id = ${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
