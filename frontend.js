//Instantiate the socket.io connection. The dependency is loaded in html.
const socket = io.connect("http://localhost:3000")

//Requests a nonce from the server, signs it, and then emits it once signed with MetaMask.
$('#loginButton').click(function () {
  if ($('#loginButton').text() == 'Login') { signMessage() }
  if ($('#loginButton').text() == 'Logout') { socket.emit("logout") }
})

function signMessage() {
  socket.emit('getnonce', { useraddress: web3.eth.coinbase })
}
socket.on('returnednonce', function (nonce) {
  console.log(nonce)
  nonce = "{Your Site} login request. Nonce: " + nonce
  web3.personal.sign(nonce, web3.eth.coinbase, function (err, res) {
    let signature = res
    socket.emit('signature', { signature: signature, nonce: nonce, useraddress: web3.eth.coinbase })
  })
})

//Receives both the initial token and the refreshes.
socket.on('refreshtoken', function (data) {
  localStorage.setItem("JWT", data.token)
  localStorage.setItem('address', data.useraddress)
  console.log(data)
})

socket.on('popupalert', function (data) {
  alert(data)
})

socket.on('loggedin', function () {
  $('#loginButton').html("Logout")
  $('#loginText').html("You are logged in as " + localStorage.getItem('address'))
  //Ternary to check non-standard condition of not having a coinbase, but being logged in and having a token.
  web3.eth.coinbase != null ? $('#loginText').html("You are logged in as " + localStorage.getItem('address')) : $('#loginText').html("Please login with MetaMask.")
  keepAlive()
})

socket.on('notloggedin', function (data) {
  $('#loginButton').html("Login")
  $('#loginText').html("Please login with MetaMask.")
  localStorage.removeItem('JWT')
  localStorage.removeItem('address')
})

//The keepAlive function presents the token for refreshing.
function keepAlive() {
  var tokenRefresher = setInterval(function () {
    if (localStorage.getItem('JWT') == null) { clearInterval(tokenRefresher) }
    if (localStorage.getItem('JWT') != null) { socket.emit('checkloginstate', { token: localStorage.getItem('JWT') }) }
  }, 60000)
}

//Check to see if the user is logged in when they refresh the page.
isLoggedIn()

function isLoggedIn() {
  if (localStorage.getItem('JWT') === null) {
    $('#loginButton').html("Login")
    $('#loginText').html("Please login with MetaMask.")

  } else {
    $('#loginButton').html("Logout")
    $('#loginText').html("You are logged in as " + localStorage.getItem('address'))
    //This emission is required for the login button to show up when not logged in.
    socket.emit('checkloginstate', { token: localStorage.getItem('JWT') })
  }
}

socket.on("changedaccount", function () {
  socket.emit("popupalert", "Web3 account changed. Please login again.")
  socket.emit("notloggedin")
})

//The following code is from the MetaMask documentation to work with the 2020 breaking changes. The only modification is the addition starting on line 135 to account for a logged-in user changing accounts.
if (typeof ethereum !== 'undefined') {

  /*********************************************************/
  /* Handle chain (network) and chainChanged, per EIP 1193 */
  /*********************************************************/

  let currentChainId = null
  ethereum
    .send("eth_chainId")
    .then(handleChainChanged)
    .catch(err => console.error(err)) // This should never happen.

  ethereum.on("chainChanged", handleChainChanged)

  function handleChainChanged(chainId) {
    if (currentChainId !== chainId) {
      currentChainId = chainId
      // Run any other necessary logic...
    }
  }

  /**********************************************************/
  /* Handle user accounts and accountsChanged, per EIP 1193 */
  /**********************************************************/

  let currentAccount = null
  ethereum
    .send("eth_accounts")
    .then(handleAccountsChanged)
    .catch(err => {
      // In the future, maybe in 2020, this will return a 4100 error if
      // the user has yet to connect
      if (err.code === 4100) {
        // EIP 1193 unauthorized error
        console.log("Please connect to MetaMask.")
      } else {
        console.error(err)
      }
    })

  // Note that this event is emitted on page load.
  // If the array of accounts is non-empty, you're already
  // connected.
  ethereum.on("accountsChanged", handleAccountsChanged)

  // For now, 'eth_accounts' will continue to always return an array
  function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      // MetaMask is locked or the user has not connected any accounts
      console.log("Please connect to MetaMask.")
    }

    if (accounts[0] !== currentAccount) {
      currentAccount = accounts[0]
      //When account changed.
      if (currentAccount != undefined) {
        $('#loginButton').html('Login')
        $('#loginText').html('Please login with MetaMask.')
        socket.emit("changedaccount")
        return
      }
      // Run any other necessary logic...
    }
  }

  /***********************************/
  /* Handle connecting, per EIP 1102 */
  /***********************************/

  // You should only attempt to connect in response to user interaction,
  // such as a button click. Otherwise, you're popup-spamming the user
  // like it's 1999.
  // If you can't retrieve the user's account(s), you should encourage the user
  // to initiate a connection attempt.
  document.getElementById("connectButton", connect)

  function connect() {
    // This is equivalent to ethereum.enable()
    ethereum
      .send("eth_requestAccounts")
      .then(handleAccountsChanged)
      .then(signMessage)
      .catch(err => {
        if (err.code === 4001) {
          // EIP 1193 userRejectedRequest error.
          console.log("Please connect to MetaMask.")
        } else {
          console.error(err)
        }
      })
  }
}

if (typeof ethereum === "undefined") {
  alert("Web3 issue detected.")
}
