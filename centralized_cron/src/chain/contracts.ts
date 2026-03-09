import { config } from '../config'

// Minimal ABIs with only the functions we use.

export const oracleAggregatorAbi = [
  {
    type: 'function',
    name: 'getActiveFlights',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'flightId', type: 'string' },
          { name: 'date', type: 'string' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getFlightStatus',
    stateMutability: 'view',
    inputs: [
      { name: 'flightId', type: 'string' },
      { name: 'date', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'updateFlightStatus',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'flightId', type: 'string' },
      { name: 'date', type: 'string' },
      { name: 'status', type: 'uint8' },
    ],
    outputs: [],
  },
] as const

export const controllerAbi = [
  {
    type: 'function',
    name: 'checkAndSettle',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

export const ORACLE_AGGREGATOR_ADDRESS = config.ORACLE_AGGREGATOR_ADDRESS as `0x${string}`
export const CONTROLLER_ADDRESS = config.CONTROLLER_ADDRESS as `0x${string}`

