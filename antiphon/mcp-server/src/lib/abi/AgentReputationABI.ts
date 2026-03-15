export const AgentReputationABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [],
        "name": "CannotRateSelf",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "InvalidLimit",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "uint8",
                "name": "rating",
                "type": "uint8"
            }
        ],
        "name": "InvalidRating",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "InvalidTargetAgent",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "NoRatingsFound",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "rater",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "targetAgent",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "nextAllowedTime",
                "type": "uint256"
            }
        ],
        "name": "RateLimitExceeded",
        "type": "error"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "FirstRatingReceived",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "targetAgent",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "rater",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint8",
                "name": "rating",
                "type": "uint8"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "comment",
                "type": "string"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "proofCID",
                "type": "string"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "ReputationPosted",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "MAX_RATING",
        "outputs": [
            {
                "internalType": "uint8",
                "name": "",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "MIN_RATING",
        "outputs": [
            {
                "internalType": "uint8",
                "name": "",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "RATE_LIMIT_PERIOD",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "SCORE_MULTIPLIER",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "rater",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "targetAgent",
                "type": "address"
            }
        ],
        "name": "canRate",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            },
            {
                "internalType": "uint256",
                "name": "nextAllowedTime",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "getAllRatings",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint8",
                        "name": "rating",
                        "type": "uint8"
                    },
                    {
                        "internalType": "string",
                        "name": "comment",
                        "type": "string"
                    },
                    {
                        "internalType": "string",
                        "name": "proofCID",
                        "type": "string"
                    },
                    {
                        "internalType": "uint256",
                        "name": "timestamp",
                        "type": "uint256"
                    },
                    {
                        "internalType": "address",
                        "name": "rater",
                        "type": "address"
                    }
                ],
                "internalType": "struct AgentReputationRegistry.Rating[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "getRatingsCount",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "limit",
                "type": "uint256"
            }
        ],
        "name": "getRecentRatings",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint8",
                        "name": "rating",
                        "type": "uint8"
                    },
                    {
                        "internalType": "string",
                        "name": "comment",
                        "type": "string"
                    },
                    {
                        "internalType": "string",
                        "name": "proofCID",
                        "type": "string"
                    },
                    {
                        "internalType": "uint256",
                        "name": "timestamp",
                        "type": "uint256"
                    },
                    {
                        "internalType": "address",
                        "name": "rater",
                        "type": "address"
                    }
                ],
                "internalType": "struct AgentReputationRegistry.Rating[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "getReputationScore",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "score",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "totalRatings",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "hasBeenRated",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "targetAgent",
                "type": "address"
            },
            {
                "internalType": "uint8",
                "name": "rating",
                "type": "uint8"
            },
            {
                "internalType": "string",
                "name": "comment",
                "type": "string"
            },
            {
                "internalType": "string",
                "name": "proofCID",
                "type": "string"
            }
        ],
        "name": "postReputation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;