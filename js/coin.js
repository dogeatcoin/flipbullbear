document.addEventListener('DOMContentLoaded', () => {
    // Variables for message handling
    let currentFullMessage = '';
    const MAX_MESSAGE_LENGTH = 200;
    const messagePopup = document.getElementById('message-popup');
    const popupMessage = document.getElementById('popup-message');

    // Create the bull and bear icons for the coin
    createCoinFaces();

    // Get the elements
    const coin = document.getElementById('coin');
    const status = document.getElementById('status');
    const coinContainer = document.querySelector('.coin-container');
    const betAmount = document.getElementById('bet-amount');
    const betBullButton = document.getElementById('bet-bull');
    const betBearButton = document.getElementById('bet-bear');
    const bettingForm = document.querySelector('.betting-form');
    const messageBox = document.querySelector('.message-box');

    // Contract configuration
    let contract;
    let contractABI;

    // Initially disable bet buttons
    betBullButton.disabled = true;
    betBearButton.disabled = true;

    // Load contract ABI and initialize contract
    fetch('/abi/FlipCoinGame.abi.json')
        .then(response => response.json())
        .then(abiData => {
            contractABI = abiData.abi; // Extract the ABI array from the JSON
            if (window.web3Instance && CONTRACT_CONFIG.address) {
                contract = new window.web3Instance.eth.Contract(contractABI, CONTRACT_CONFIG.address);
                if (window.userAccounts && window.userAccounts.length > 0) {
                    betBullButton.disabled = false;
                    betBearButton.disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error loading contract ABI:', error);
            status.textContent = 'Error loading game contract';
        });

    // Variables for liquidity tracking
    let houseLiquidity = '0';
    let liquidityInterval;
    let hasLiquidityBeenFetched = false;

    // Function to fetch house liquidity
    async function updateHouseLiquidity() {
        if (!contract || !window.userAccounts || !window.userAccounts.length) return;

        try {
            const liquidity = await contract.methods.houseLiquidity().call();
            houseLiquidity = liquidity;
            hasLiquidityBeenFetched = true;

            // Also get max bet
            const maxBet = await contract.methods.maxBet().call();

            // Update status or validate bet amount
            validateAmount();
        } catch (error) {
            console.error('Error fetching house liquidity:', error);
        }
    }

    // Initialize contract when wallet is connected
    document.addEventListener('walletConnected', (event) => {
        const { web3 } = event.detail;
        if (web3 && contractABI && CONTRACT_CONFIG.address) {
            contract = new web3.eth.Contract(contractABI, CONTRACT_CONFIG.address);

            // Enable betting form and input when wallet is connected
            if (bettingForm) {
                bettingForm.classList.add('enabled');
                betAmount.disabled = false;
            }

            validateAmount(); // Revalidate buttons when wallet connects

            // Start periodic liquidity check only after wallet is connected
            updateHouseLiquidity(); // Initial check
            liquidityInterval = setInterval(updateHouseLiquidity, 10000); // Check every 10 seconds
        }
    });

    // Listen for wallet disconnection
    document.addEventListener('walletDisconnected', () => {
        if (bettingForm) {
            bettingForm.classList.remove('enabled');
            betAmount.disabled = true;
        }
        // Clear liquidity interval and reset state
        if (liquidityInterval) {
            clearInterval(liquidityInterval);
        }
        houseLiquidity = '0';
        hasLiquidityBeenFetched = false;
        validateAmount(); // This will disable the buttons since wallet is disconnected
    });

    // Set initial side
    let currentSide = 'heads';

    // Add click event to the coin container to toggle sides
    coinContainer.addEventListener('click', () => {
        currentSide = currentSide === 'heads' ? 'tails' : 'heads';
        updateCoinDisplay();
    });

    // Function to show messages
    function showMessage(message, isError = false) {
        currentFullMessage = message;
        if (status) {
            status.textContent = message.length > MAX_MESSAGE_LENGTH ?
                message.substring(0, MAX_MESSAGE_LENGTH) + '... (click to see more)' :
                message;
        }
        if (messageBox) {
            messageBox.className = 'message-box has-message' + (isError ? ' error' : '');
        }
    }

    // Add message box click handler
    if (messageBox) {
        messageBox.addEventListener('click', () => {
            if (currentFullMessage.length > MAX_MESSAGE_LENGTH) {
                if (popupMessage && messagePopup) {
                    popupMessage.textContent = currentFullMessage;
                    messagePopup.classList.add('show');
                }
            }
        });
    }

    // Validate bet amount
    function validateBet() {
        const amount = betAmount.value;
        if (!amount || parseFloat(amount) <= 0) {
            showMessage('Please enter a valid bet amount greater than 0', true);
            return false;
        }
        if (!window.userAccounts || !window.userAccounts[0]) {
            showMessage('Please connect your wallet first', true);
            return false;
        }
        return true;
    }

    // Handle betting
    async function placeBet() {
        if (!validateBet()) return;

        try {
            if (!contract) {
                showMessage('Contract not initialized', true);
                return;
            }

            const amount = window.web3Instance.utils.toWei(betAmount.value, 'ether');

            // Check against house liquidity one more time before sending transaction
            const currentLiquidity = await contract.methods.houseLiquidity().call();
            if (BigInt(amount) * 2n > BigInt(currentLiquidity)) {
                showMessage('Bet amount exceeds maximum allowed', true);
                return;
            }

            showMessage('Waiting for transaction approval...');

            // Disable buttons while transaction is processing
            betBullButton.disabled = true;
            betBearButton.disabled = true;

            // Call the play function on the contract
            const transaction = await contract.methods.play().send({
                from: window.userAccounts[0],
                value: amount
            });

            // Start the coin flip animation
            coin.classList.add('flip');

            // Wait for transaction confirmation
            showMessage('Transaction confirmed! Revealing result...');

            // Get the result from the transaction events
            const betPlacedEvent = transaction.events.BetPlaced;
            const won = betPlacedEvent.returnValues.won;

            // After animation completes
            setTimeout(() => {
                coin.classList.remove('flip');

                // Show result without changing the starting position
                const resultAmount = window.web3Instance.utils.fromWei(amount, 'ether');
                showMessage(won ?
                    `You won! +${resultAmount * 2} MONAD` :
                    `You lost! -${resultAmount} MONAD`);

                // Re-enable buttons
                betBullButton.disabled = false;
                betBearButton.disabled = false;
            }, 1500);

        } catch (error) {
            console.error('Transaction failed:', error);
            showMessage('Transaction failed: ' + (error.message || 'Unknown error'), true);

            // Re-enable buttons
            betBullButton.disabled = false;
            betBearButton.disabled = false;
        }
    }

    // Add click events to betting buttons
    betBullButton.addEventListener('click', () => {
        placeBet();
    });

    betBearButton.addEventListener('click', () => {
        placeBet();
    });

    // Function to update coin display based on current side
    function updateCoinDisplay() {
        if (currentSide === 'heads') {
            coin.style.transform = 'rotateY(0deg)';
        } else {
            coin.style.transform = 'rotateY(180deg)';
        }
    }

    // Function to validate amount and update button states
    function validateAmount() {
        const amount = parseFloat(betAmount.value);
        const isValid = amount > 0;
        const isWalletConnected = window.userAccounts && window.userAccounts.length > 0;

        // Convert house liquidity to ETH for comparison
        const liquidityInEth = window.web3Instance && houseLiquidity ?
            parseFloat(window.web3Instance.utils.fromWei(houseLiquidity, 'ether')) : 0;

        const maxBet = liquidityInEth / 2; // Divide by 2 because winning pays 2x
        const exceedsLiquidity = amount > maxBet;

        betBullButton.disabled = !isValid || !isWalletConnected || exceedsLiquidity;
        betBearButton.disabled = !isValid || !isWalletConnected || exceedsLiquidity;

        // Clear any existing error message if the amount is valid
        if (!exceedsLiquidity && amount > 0) {
            clearMessage();
        }
        // Only show max bet message if liquidity has been fetched and amount exceeds it
        else if (hasLiquidityBeenFetched && exceedsLiquidity && amount > 0) {
            showMessage(`Maximum bet allowed is ${maxBet.toFixed(2)} MONAD`, true);
        }
    }

    // Function to clear message
    function clearMessage() {
        if (status) {
            status.textContent = '';
            if (messageBox) {
                messageBox.className = 'message-box';
            }
        }
    }

    // Add input event listener to bet amount
    betAmount.addEventListener('input', validateAmount);

    // Set initial state for bet amount input
    if (betAmount) {
        betAmount.disabled = !window.userAccounts || !window.userAccounts.length;
    }

    // Run initial validation for the default amount
    validateAmount();
});

// Function to create the coin faces with bull and bear icons
function createCoinFaces() {
    // Get the face elements
    const headsElement = document.getElementById('heads');
    const tailsElement = document.getElementById('tails');

    // Clear any existing content
    headsElement.innerHTML = '';
    tailsElement.innerHTML = '';

    // Create bull icon for heads
    const bullIcon = document.createElement('div');
    bullIcon.className = 'animal-icon bull-icon';
    bullIcon.innerHTML = `
        <div class="bull-head">
            <div class="bull-horns left-horn"></div>
            <div class="bull-horns right-horn"></div>
            <div class="bull-face">
                <div class="bull-eye left"></div>
                <div class="bull-eye right"></div>
                <div class="bull-nose"></div>
            </div>
        </div>
        <div class="bull-body">
            <div class="bull-legs"></div>
        </div>
    `;
    headsElement.appendChild(bullIcon);

    // Create bear icon for tails
    const bearIcon = document.createElement('div');
    bearIcon.className = 'animal-icon bear-icon';
    bearIcon.innerHTML = `
        <div class="bear-head">
            <div class="bear-ears left-ear"></div>
            <div class="bear-ears right-ear"></div>
            <div class="bear-face">
                <div class="bear-eye left"></div>
                <div class="bear-eye right"></div>
                <div class="bear-nose"></div>
                <div class="bear-mouth"></div>
            </div>
        </div>
        <div class="bear-body">
            <div class="bear-legs"></div>
        </div>
    `;
    tailsElement.appendChild(bearIcon);

    // Add market direction indicators
    const bullTrend = document.createElement('div');
    bullTrend.className = 'trend-indicator bull-trend';
    bullTrend.innerHTML = '↗';
    headsElement.appendChild(bullTrend);

    const bearTrend = document.createElement('div');
    bearTrend.className = 'trend-indicator bear-trend';
    bearTrend.innerHTML = '↘';
    tailsElement.appendChild(bearTrend);
}