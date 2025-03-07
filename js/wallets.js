// Web3 Configuration
let web3;
let provider;
let accounts = [];
let statusElement;
let messageBox;
let connectWalletButton;
let connectWalletButtonText;
let messagePopup;
let popupMessage;
let closePopup;
let currentFullMessage = '';

// Contract configuration
const CONTRACT_CONFIG = {
    address: '0x9f6843cA93a01B1f258611ee3a50bC5409CD96B9',
    network: '0x279F' // Monad Testnet
};

const MAX_MESSAGE_LENGTH = 200;

// Initialize elements and listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeElements();
    setupEventListeners();
});

function initializeElements() {
    statusElement = document.getElementById('status');
    messageBox = document.querySelector('.message-box');
    connectWalletButton = document.getElementById('connect-wallet');
    connectWalletButtonText = connectWalletButton.querySelector('span');
    messagePopup = document.getElementById('message-popup');
    popupMessage = document.getElementById('popup-message');
    closePopup = document.querySelector('.close-popup');
}

function setupEventListeners() {
    if (connectWalletButton) {
        connectWalletButton.addEventListener("click", async () => {
            if (!provider) {
                await connectWallet();
            } else {
                await disconnectWallet();
            }
        });
    }

    if (messageBox) {
        messageBox.addEventListener('click', () => {
            if (currentFullMessage.length > MAX_MESSAGE_LENGTH) {
                showPopup(currentFullMessage);
            }
        });
    }

    if (closePopup) {
        closePopup.addEventListener('click', hidePopup);
    }

    // Close popup when clicking outside
    if (messagePopup) {
        messagePopup.addEventListener('click', (e) => {
            if (e.target === messagePopup) {
                hidePopup();
            }
        });
    }
}

function showMessage(message, isError = false) {
    currentFullMessage = message;
    if (statusElement) {
        statusElement.textContent = message.length > MAX_MESSAGE_LENGTH ?
            message.substring(0, MAX_MESSAGE_LENGTH) + '... (click to see more)' :
            message;
    }
    if (messageBox) {
        messageBox.className = 'message-box' + (isError ? ' error' : '');
    }
}

function showPopup(message) {
    if (popupMessage && messagePopup) {
        popupMessage.textContent = message;
        messagePopup.classList.add('show');
    }
}

function hidePopup() {
    if (messagePopup) {
        messagePopup.classList.remove('show');
    }
}

// Connect wallet function
async function connectWallet() {
    try {
        showMessage("Connecting wallet...");
        // Check if MetaMask is installed
        if (typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask) {
            provider = window.ethereum;
            await provider.request({ method: 'eth_requestAccounts' });
            // Check if the user is on the correct network
            const chainId = await provider.request({ method: 'eth_chainId' });
            if (chainId !== CONTRACT_CONFIG.network) {
                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: CONTRACT_CONFIG.network }],
                    });
                } catch (switchError) {
                    // This error code indicates that the chain has not been added to MetaMask
                    if (switchError.code === 4902) {
                        try {
                            await provider.request({
                                method: 'wallet_addEthereumChain',
                                params: [
                                    {
                                        chainId: CONTRACT_CONFIG.network,
                                        rpcUrls: ['https://testnet-rpc.monad.xyz'],
                                        chainName: 'Monad Testnet',
                                        nativeCurrency: {
                                            name: 'Monad Testnet Token',
                                            symbol: 'MON',
                                            decimals: 18,
                                        },
                                        blockExplorerUrls: ['https://explorer.monad.xyz'],
                                    },
                                ],
                            });
                        } catch (addError) {
                            console.error(addError);
                            showMessage("Failed to add the network: " + addError.message, true);
                            return;
                        }
                    } else {
                        console.error(switchError);
                        showMessage("Failed to switch the network: " + switchError.message, true);
                        return;
                    }
                }
            }
        } else {
            window.open('https://metamask.io/download/', '_blank');
            showMessage("MetaMask is not installed.", true);
            return;
        }

        // Initialize Web3 with provider
        web3 = new Web3(provider);
        window.web3Instance = web3;

        // Get user accounts
        accounts = await web3.eth.getAccounts();
        window.userAccounts = accounts;

        if (accounts.length > 0) {
            const shortenedAddress = `${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`;
            connectWalletButtonText.textContent = shortenedAddress;
            connectWalletButton.classList.add('connected');
            showMessage("Wallet connected!");

            // Dispatch wallet connected event
            const event = new CustomEvent('walletConnected', {
                detail: {
                    address: accounts[0],
                    web3: web3
                }
            });
            document.dispatchEvent(event);
        }

        // Subscribe to accounts change
        provider.on("accountsChanged", (newAccounts) => {
            accounts = newAccounts;
            if (accounts.length > 0) {
                const shortenedAddress = `${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`;
                connectWalletButtonText.textContent = shortenedAddress;
                connectWalletButton.classList.add('connected');
            } else {
                connectWalletButtonText.textContent = "Connect Wallet";
                connectWalletButton.classList.remove('connected');
                showMessage("Wallet disconnected");
            }
        });

        // Subscribe to chainId change
        provider.on("chainChanged", () => {
            window.location.reload();
        });

        // Subscribe to provider disconnection
        provider.on("disconnect", () => {
            disconnectWallet();
        });

    } catch (error) {
        console.error("Could not connect to wallet:", error);
        showMessage("Connection failed: " + error.message, true);
    }
}

// Disconnect wallet function
async function disconnectWallet() {
    if (provider) {
        // Clear connection
        provider = null;
        accounts = [];
        connectWalletButtonText.textContent = "Connect Wallet";
        connectWalletButton.classList.remove('connected');
        showMessage("Wallet disconnected");

        // Dispatch wallet disconnected event
        const event = new CustomEvent('walletDisconnected');
        document.dispatchEvent(event);
    }
}