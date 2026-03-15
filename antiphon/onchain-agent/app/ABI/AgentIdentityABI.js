export const AgentIdentityABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "AgentAlreadyRegistered",
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
        "name": "AgentNotRegistered",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "EmptyCapabilityTags",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "InvalidCID",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "InvalidCapabilityTag",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "caller",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            }
        ],
        "name": "NotAgentOwner",
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
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "oldAgentCardCID",
                "type": "string"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "newAgentCardCID",
                "type": "string"
            },
            {
                "indexed": false,
                "internalType": "string[]",
                "name": "newCapabilityTags",
                "type": "string[]"
            }
        ],
        "name": "AgentCardUpdated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "agent",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "agentCardCID",
                "type": "string"
            },
            {
                "indexed": false,
                "internalType": "string[]",
                "name": "capabilityTags",
                "type": "string[]"
            }
        ],
        "name": "AgentRegistered",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "agent",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "capability",
                "type": "string"
            }
        ],
        "name": "CapabilityAdded",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "agent",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "string",
                "name": "capability",
                "type": "string"
            }
        ],
        "name": "CapabilityRemoved",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "agent",
                "type": "address"
            },
            {
                "internalType": "string",
                "name": "capability",
                "type": "string"
            }
        ],
        "name": "agentHasCapability",
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
                "internalType": "string[]",
                "name": "capabilityTags",
                "type": "string[]"
            },
            {
                "internalType": "uint256",
                "name": "offset",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "limit",
                "type": "uint256"
            }
        ],
        "name": "discoverAgents",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "agents",
                "type": "address[]"
            },
            {
                "internalType": "uint256",
                "name": "total",
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
        "name": "getAgentCapabilities",
        "outputs": [
            {
                "internalType": "string[]",
                "name": "",
                "type": "string[]"
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
        "name": "getAgentCard",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "string",
                "name": "capability",
                "type": "string"
            }
        ],
        "name": "getAgentsByCapability",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "",
                "type": "address[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getAllRegisteredAgents",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "",
                "type": "address[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getRegisteredAgentsCount",
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
            }
        ],
        "name": "isAgentRegistered",
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
                "internalType": "string",
                "name": "agentCardCID",
                "type": "string"
            },
            {
                "internalType": "string[]",
                "name": "capabilityTags",
                "type": "string[]"
            }
        ],
        "name": "registerAgent",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "string",
                "name": "newCID",
                "type": "string"
            },
            {
                "internalType": "string[]",
                "name": "newCapabilityTags",
                "type": "string[]"
            }
        ],
        "name": "updateAgentCard",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];