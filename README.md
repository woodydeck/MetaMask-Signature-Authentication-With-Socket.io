This barebones project shows how to use MetaMask for login and socket.io authentication.

## Setup

You will need Node.js, MySQL, and a web server as MetaMask will not work without one. The project by default is configured for use over localhost. I use XAMPP on MacOS as a local test server.

***Node.js***

The dependencies are noted in the server.js file as well as the package.json which has the version numbers I used in case another intrepid open source crypto decides to break something on a stereotypical know-it-all whim.

Please note that web3 is not needed on the backend for this implementation as we are only using the message signing functionality of MetaMask. If you are going to do things like check for transactions or events, then you will need web3 on the server-side.

***Frontend***

The index.html loads jQuery, and the socket.io library. The frontend.js script is loaded last. In 2020, MetaMask will stop injecting web3.js, so you will need to load web3 yourself. This has been poorly communicated, so don't get frustrated if things don't work right away. Please take your anger out on the entitled millennials developing their shitcode for being disorganized, not me.

***MySQL***

I use MySQL because it is well documented and works. Feel free to live life exciting and free with MongoDB if you must, but you will have to fork and refactor.

(If you prefer, there is now a script in db folder to create a MySql database.)

You will need two separate tables. One is the user table. Here you just store a 42 character varchar of the Ethereum address of the user. If you are making a game, you would put points, balances, and other things here too. The address column is indexed as unique.

![enter image description here](https://i.imgur.com/pYfLsN6.png)
> The user table in MySQL

Then you will need to keep a list of nonces so you can validate the messages of a user requesting a token.

![enter image description here](https://i.imgur.com/8g7F15f.png)
> The noncelist table in MySQL

This has two separate columns for time. The reason is that instead of running a cron to cleanup stale nonces issued, we can just check when it was issued when validating. If you don't control your server time settings, like on a managed VPS, it is much easier to just find the time in the server script and update that in the database for checking, as it will be the same script later comparing the time elapsed since the nonce was issued.

The server.js script updates the nonce of the user if the user has already request a nonce, and saves the last timestamp. The server running the server.js script then prints its own  own version of time in the datetime column that you can use for analytics or comparison relative to other data later. You could also omit this column if you don't have a need for it.

The noncelist is also indexed by the user field as unique, which is also and Ethereum address.

Screen capture of the login flow: https://i.imgur.com/CjhRhWX.mp4
