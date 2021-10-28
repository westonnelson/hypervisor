import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-typechain'
import "hardhat-watcher"
import './scripts/copy-uniswap-v3-artifacts.ts'
import './tasks/hypervisor'
import './tasks/swap'
import { parseUnits } from 'ethers/lib/utils'
import { HardhatUserConfig } from 'hardhat/types'
require('dotenv').config()
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;

const config: HardhatUserConfig = {
  networks: {
      hardhat: {
          allowUnlimitedContractSize: false,
      },
	  Arbitrum_Testnet: {
		  url: "https://rinkeby.arbitrum.io/rpc",
		  accounts: [`0x${PRIVATE_KEY}`],
		  gas: 2100000,
		  gasPrice: 8000000000,
	  },
	  Arbitrum_Mainnet: {
		  url: "https://arb1.arbitrum.io/rpc",
		  accounts: [`0x${PRIVATE_KEY}`],
	  },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
  },
  watcher: {
      compilation: {
          tasks: ["compile"],
      }
  },
  solidity: {
      version: '0.7.6',
      settings: {
          optimizer: {
              enabled: true,
              runs: 800,
          },
          metadata: {
              // do not include the metadata hash, since this is machine dependent
              // and we want all generated code to be deterministic
              // https://docs.soliditylang.org/en/v0.7.6/metadata.html
              bytecodeHash: 'none',
          },
      },
  },
  mocha: {
    timeout: 2000000
  }
}
export default config;
