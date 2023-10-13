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
        request.username = payload.username;
        next();
      }
    });
  }
};

//3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const tweetsQuery = `
SELECT
user.username, tweet.tweet, tweet.date_time AS dateTime
FROM
follower
INNER JOIN tweet
ON follower.following_user_id = tweet.user_id
INNER JOIN user
ON tweet.user_id = user.user_id
WHERE
follower.follower_user_id = 4
ORDER BY
tweet.date_time DESC
LIMIT 4;`;
  const userDetails = await database.all(tweetsQuery);
  response.send(userDetails);
});

//4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const tweetsQuery = `
SELECT distinct
name
FROM follower INNER JOIN user ON user.user_id = follower.following_user_id 
WHERE username NOT LIKE '${username}'
ORDER BY follower.following_user_id`;
  const userDetails = await database.all(tweetsQuery);

  response.send(userDetails);
});

//5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT distinct name FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
  WHERE following_user_id = 4`;
  const userDetails = await database.all(selectUserQuery);
  response.send(userDetails);
});

//6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const tweetsQuery = `
SELECT
*
FROM tweet
WHERE tweet_id=${tweetId}
`;
  const tweetResult = await database.get(tweetsQuery);
  const userFollowersQuery = `
SELECT
*
FROM follower INNER JOIN user on user.user_id = follower.following_user_id
WHERE follower.follower_user_id = ${tweetId};`;
  const userFollowers = await database.all(userFollowersQuery);
  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    response.send("Invalid Request");
    response.status(401);
  } else {
    response.send(tweetResult);
  }
});

//7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    const selectUserQuery = `
  SELECT distinct T.username as likes
  FROM (follower 
  INNER JOIN user 
  ON follower.follower_user_id = user.user_id) AS T
  INNER JOIN tweet
  ON T.user_id = tweet.user_id
  INNER JOIN like 
  ON tweet.tweet_id = like.tweet_id
  WHERE tweet.tweet_id = ${tweetId}`;
    const userDetails = await database.all(selectUserQuery);
    if (userDetails.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(userDetails);
    }
  }
);

//8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    const selectUserQuery = `
  SELECT distinct T.username as name,
  reply.reply
  FROM (follower 
  INNER JOIN user 
  ON follower.follower_user_id = user.user_id) AS T
  INNER JOIN tweet
  ON T.user_id = tweet.user_id
  INNER JOIN reply 
  ON tweet.tweet_id = reply.tweet_id
  WHERE tweet.tweet_id = ${tweetId}`;
    const userDetails = await database.all(selectUserQuery);
    if (userDetails.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: userDetails });
    }
  }
);

//9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const tweetsQuery = `
  SELECT
  tweet,
  (
    SELECT COUNT(like_id)
    FROM like
    WHERE tweet_id=tweet.tweet_id
  ) AS likes,
  (
    SELECT COUNT(reply_id)
    FROM reply
    WHERE tweet_id=tweet.tweet_id
  ) AS replies,
  date_time AS dateTime
  FROM tweet
WHERE user_id= 2`;
  const userDetails = await database.all(tweetsQuery);
  response.send(userDetails);
});

//10

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

//11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    const { username } = request;
    const deleteTweetQuery = `
    DELETE FROM
      tweet  
    WHERE
      tweet_id = ${tweetId}  ;`;
    const deleteDetails = await database.run(deleteTweetQuery);
    if (deleteDetails.length === 0) {
      response.send("Invalid Request");
      response.status(401);
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
