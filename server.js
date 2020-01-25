//Database library.
const mysql = require("mysql")
//Socket.io library for websockets.
const server = require("http").createServer(),
  io = require("socket.io")(server),
  port = 3000
server.listen(port, "localhost")
//Library to authenticate users.
const njwt = require("njwt")
//Library to validate signatures.
const util = require("ethereumjs-util")
//Library to decode the JWT.
const jwtDecode = require("jwt-decode")

//Authentication data for the mysql database.
var db = mysql.createConnection({
  host: "mysql.{yourserver}.com",
  user: "{username}",
  password: "{password}",
  database: "{database_name}",
  port: "3306"
})

/////VALIDATION FUNCTIONS/////
//Secret key for the validation of tokens.
const key = "Trump2020" //This is a test key. Do not use in production.

function createToken(userAddress) {
  let claims = { iss: "https://yoursite.com", sub: userAddress } //This is the JSON data embedded in the token.
  let jwt = njwt.create(claims, key) //Create a token (JWT).
  jwt.setExpiration(new Date().getTime() + 15 * 60 * 1000) //Set the expiriation to fifteen minutes.
  let token = jwt.compact() //The JWT in compacted form for sending over the internets.
  return token
}

function verifyToken(token) {
  try {
    njwt.verify(token, key)
    return true
  } catch (err) {
    return false
  }
}

function validateMessage(nonce, signature) {
  //Make sure the function is returning the correct address. It can return an incorrect one if this function is musconfigured.
  if (signature != undefined && nonce != undefined) {
    nonce = "\x19Ethereum Signed Message:\n" + nonce.length + nonce
    nonce = util.keccak(nonce)
    const sig = signature
    const { v, r, s } = util.fromRpcSig(sig)
    const pubKey = util.ecrecover(util.toBuffer(nonce), v, r, s)
    const addrBuf = util.pubToAddress(pubKey)
    const addr = util.bufferToHex(addrBuf)
    return addr
  } else {
    //Error on decoding.
    return console.log('Error decoding.')
  }
}

//Validates Ethereum addresses.
const addressRegex = /^0x([A-Fa-f0-9]{40})$/

//Note that signatures and token validation are handled by validateMessage().
//Hopefully the above patterns are not ReDoS vulnerable. :Shrug:
/////END VALIDATION FUNCTIONS/////

/////SOCKET.IO FUNCTIONS/////
io.on("connection", function (socket) {

  /////Step #1 for authentication.
  socket.on("getnonce", function (data) {
    let nonce = Math.floor(Math.random() * 100000000)
    if (data && addressRegex.test(data.useraddress) == true) {
      //Save the nonce and claimed useraddress to the database for validation. Generate the timestamp in the script to avoid server timezone errors from Mysql.
      db.query("INSERT INTO noncelist (timestamp, user, nonce) VALUES (" + new Date().valueOf() + ",'" + data.useraddress + "'," + nonce + ") ON DUPLICATE KEY UPDATE timestamp=" + new Date().valueOf() + "," + "user='" + data.useraddress + "', nonce=" + nonce, function (err, result) {
        if (!err) {
          socket.emit("returnednonce", nonce)
        } else {
          //Error handling for callback #1.
          socket.emit("popupalert", "Something went wrong when fetching a nonce. Message #1")
          return socket.emit("notloggedin")
        }
      })
    } else {
      //Error handling for callback #1.
      socket.emit("popupalert", "Something went wrong when fetching a nonce. Message #2")
      return socket.emit("notloggedin")
    }
  })

  /////Step #2 for authentication.
  socket.on("signature", function (data) {
    //Validate the signature and nonce presented in order to issue a token.
    if (data && validateMessage(data.nonce, data.signature) == data.useraddress) {
      //Get the actual nonce number from the nonce object which is a string concatenated with the nonce.
      let pureNonce = parseInt(data.nonce.slice(-9))
      //Callback #1
      db.query("SELECT * FROM noncelist WHERE user='" + validateMessage(data.nonce, data.signature) + "'", function (err, result) {
        if (!err) {

          //You can console.log to test the times being dealt with.
          //console.log('Time Difference: ' + (new Date().valueOf() - result[0].timestamp))

          //Check if the nonce the user claims is the one on file in the last 5 minutes.
          if (result[0].nonce === pureNonce && (new Date().valueOf() - result[0].timestamp < 60000)) {
            let userAddressRecovered = validateMessage(data.nonce, data.signature)
            let token = createToken(userAddressRecovered)
            //Callback #2 - If the token is valid, update the client with data pulled from the following query.
            db.query("SELECT * FROM users WHERE address ='" + data.useraddress + "'", function (err, user) {
              if (!err) {
                //If there is a null result, then we must add the user to the database before proceding.
                if (user.length > 0) {
                  socket.emit("refreshtoken", { token: token, useraddress: jwtDecode(token).sub })
                  socket.emit("loggedin")
                  console.log("Connection is authenticated for", data.useraddress)
                }
                //Add user to the database. If only a few more callbacks could be nested here...
                if (user.length == 0) {
                  //Callback #3
                  db.query("INSERT INTO users (address) VALUES ('" + data.useraddress + "')", function (err, res) {
                    if (!err) {
                      socket.emit("refreshtoken", { token: token, useraddress: jwtDecode(token).sub })
                      socket.emit("loggedin")
                      console.log("User", data.useraddress, "doesn't exist, adding user to the database.")
                      console.log("Connection is authenticated for", data.useraddress)
                    }
                    //Error handling for callback #3.
                    if (err) {
                      return console.log("Error at adding user.")
                    }
                  }
                  )
                }
              } else {
                //Error handling for callback #2.
                return console.log("Error at user balance.")
              }
            })
          } else {
            //Error handling for the message validation check.
            socket.emit("popupalert", "Nonce validation failed. Please try logging in again or refreshing the page.")
            socket.emit("notloggedin")
            return console.log('Error. Mismatch on noncelist.')
          }
        } else {
          //Error handling for callback #1.
          socket.emit("popupalert", "Nonce validation failed. Please try logging in again or refreshing the page.")
          socket.emit("notloggedin")
          return console.log('Error. Noncelist db error.')
        }
      })
    } else {
      //Error handling for the signature validation check.
      socket.emit("popupalert", "Signature validation failed. Please try logging in again or refreshing the page.")
      socket.emit("notloggedin")
    }
  })

  /////Step #3 for authentication and refresh of token.
  socket.on("checkloginstate", function (data) {
    //Validate the token presented.
    if (data && verifyToken(data.token) == true) {

      //You can log the expiry countdown. If the user presents a token with a validity of less than 2 minutes it refreshes their token automatically on the frontend.
      //console.log('Token Expiry:', jwtDecode(data.token).exp - Date.now() / 1000)

      console.log("Connection is authenticated for socket ID", socket.id, "User", jwtDecode(data.token).sub)
      if (jwtDecode(data.token).exp - Date.now() / 1000 < 120 && jwtDecode(data.token).exp - Date.now() / 1000 > 0) {
        let newToken = createToken(jwtDecode(data.token).sub) //Use existing token's address to make new one before it expires.
        socket.emit("refreshtoken", { token: newToken, useraddress: jwtDecode(data.token).sub })
        console.log("Token refreshed for user", jwtDecode(data.token).sub)
      } else {
        //Error handling for the token date check to refresh a soon to expire token.
      }
    } else {
      //Error handling for the token validity check.
      socket.emit("notloggedin")
      socket.emit("popupalert", "Your login session has expired. Please login again.")
      console.log("Token presented not valid on 'checkloginstate'.")
    }
  })

  /////Step #4 is logout. Straightforwardly emits instructions to logout on the frontend. This deletes their JWT stored locally.
  socket.on("logout", function () {
    console.log("User Requested Logout")
    socket.emit("popupalert", "You have been logged out.")
    socket.emit("notloggedin")
  })
}) //End of socket.io