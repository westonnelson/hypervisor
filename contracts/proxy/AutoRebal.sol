// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "../interfaces/IHypervisor.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

/// @title Admin

contract AutoRebal {
    using SafeMath for uint256;

    address public admin;
    address public advisor;
    uint256 public depositDelta = 1010;
    uint256 public deltaScale = 1000; /// must be a power of 10
    address public feeRecipient;
    IUniswapV3Pool public pool;
    IHypervisor public hypervisor;
    uint256[4] public inMin = [0,0,0,0];
    modifier onlyAdvisor {
        require(msg.sender == advisor, "only advisor");
        _;
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "only admin");
        _;
    }

    constructor(address _admin, address _advisor, address _hypervisor) {
        require(_admin != address(0), "_admin should be non-zero");
        require(_advisor != address(0), "_advisor should be non-zero");
        require(_hypervisor != address(0), "_hypervisor should be non-zero");
        admin = _admin;
        advisor = _advisor;
        hypervisor = hypervisor;
    }

    function liquidityOptions() internal view returns(uint128 liquidity0, uint128 liquidity1, int24 currentTick) {

      (uint256 total0, uint256 total1) = hypervisor.getTotalAmounts();

      (uint256 compliment0, )  = getDepositAmount(address(hypervisor.token0()), total0);

      (uint256 compliment1, )  = getDepositAmount(address(hypervisor.token1()), total1);

      (uint160 sqrtRatioX96, int24 currentTick, , , , , ) = hypervisor.pool().slot0();

      uint128 liquidity0 = LiquidityAmounts.getLiquidityForAmounts(
        sqrtRatioX96,
        TickMath.getSqrtRatioAtTick(hypervisor.baseLower()),
        TickMath.getSqrtRatioAtTick(hypervisor.baseUpper()),
        total0,
        compliment0 > total1 ? total1 : compliment0
      );

      uint128 liquidity1 = LiquidityAmounts.getLiquidityForAmounts(
        sqrtRatioX96,
        TickMath.getSqrtRatioAtTick(hypervisor.baseLower()),
        TickMath.getSqrtRatioAtTick(hypervisor.baseUpper()),
        total1,
        compliment1 > total0 ? total0 : compliment1
      );
    }

    /// @param  outMin min amount0,1 returned for shares of liq 
    function rebalance(
        uint256[4] memory outMin
    ) external onlyAdvisor returns(int24 limitLower, int24 limitUpper) {
      
     (uint256 liquidity0, uint256 liquidity1, int24 currentTick) = liquidityOptions(); 

     if(liquidity0 > liquidity1) {
        // extra token1 in limit position = limit below
        limitUpper = (currentTick / hypervisor.tickSpacing()) * hypervisor.tickSpacing() - hypervisor.tickSpacing();
        if(limitUpper == currentTick) limitUpper = limitUpper - hypervisor.tickSpacing();

        limitLower = limitUpper - hypervisor.tickSpacing(); 
      }
      else {
        // extra token0 in limit position = limit above
        limitLower = (currentTick / hypervisor.tickSpacing()) * hypervisor.tickSpacing() + hypervisor.tickSpacing();
        if(limitLower == currentTick) limitLower = limitLower + hypervisor.tickSpacing();

        limitUpper = limitLower + hypervisor.tickSpacing(); 
      } 

      hypervisor.rebalance(
        hypervisor.baseLower(),
        hypervisor.baseUpper(),
        limitLower,
        limitUpper,
        feeRecipient,
        inMin,
        outMin 
      ); 
    }

    /// @notice Get the amount of token to deposit for the given amount of pair token
    /// @param token Address of token to deposit
    /// @param _deposit Amount of token to deposit
    /// @return amountStart Minimum amounts of the pair token to deposit
    /// @return amountEnd Maximum amounts of the pair token to deposit
    function getDepositAmount(
      address token,
      uint256 _deposit
    ) public view returns (uint256 amountStart, uint256 amountEnd) {
      require(token == address(hypervisor.token0()) || token == address(hypervisor.token1()), "token mistmatch");
      require(_deposit > 0, "deposits can't be zero");
      (, uint256 total0, uint256 total1) = hypervisor.getBasePosition();
      //TODO add token0 balanceOf, token1 balanceof
      if (hypervisor.totalSupply() == 0 || total0 == 0 || total1 == 0) {
        amountStart = 0;
        if (token == address(hypervisor.token0())) {
          amountEnd = hypervisor.deposit1Max();
        } else {
          amountEnd = hypervisor.deposit0Max();
        }
      } else {
        uint256 ratioStart;
        uint256 ratioEnd;
        if (token == address(hypervisor.token0())) {
          ratioStart = FullMath.mulDiv(total0.mul(depositDelta), 1e18, total1.mul(deltaScale));
          ratioEnd = FullMath.mulDiv(total0.mul(deltaScale), 1e18, total1.mul(depositDelta));
        } else {
          ratioStart = FullMath.mulDiv(total1.mul(depositDelta), 1e18, total0.mul(deltaScale));
          ratioEnd = FullMath.mulDiv(total1.mul(deltaScale), 1e18, total0.mul(depositDelta));
        }
        amountStart = FullMath.mulDiv(_deposit, 1e18, ratioStart);
        amountEnd = FullMath.mulDiv(_deposit, 1e18, ratioEnd);
      }
    }

    /// @notice Pull liquidity tokens from liquidity and receive the tokens
    /// @param shares Number of liquidity tokens to pull from liquidity
    /// @return base0 amount of token0 received from base position
    /// @return base1 amount of token1 received from base position
    /// @return limit0 amount of token0 received from limit position
    /// @return limit1 amount of token1 received from limit position
    function pullLiquidity(
      uint256 shares,
      uint256[4] memory minAmounts 
    ) external onlyAdvisor returns(
        uint256 base0,
        uint256 base1,
        uint256 limit0,
        uint256 limit1
      ) {
      (base0, base1, limit0, limit1) = hypervisor.pullLiquidity(shares, minAmounts);
    }

    /// @notice Add tokens to base liquidity
    /// @param amount0 Amount of token0 to add
    /// @param amount1 Amount of token1 to add
    function addBaseLiquidity(uint256 amount0, uint256 amount1, uint256[2] memory inMin) external onlyAdvisor {
        hypervisor.addBaseLiquidity(amount0, amount1, inMin);
    }

    /// @notice Add tokens to limit liquidity
    /// @param amount0 Amount of token0 to add
    /// @param amount1 Amount of token1 to add
    function addLimitLiquidity(uint256 amount0, uint256 amount1, uint256[2] memory inMin) external onlyAdvisor {
        hypervisor.addLimitLiquidity(amount0, amount1, inMin);
    }

    /// @notice compound pending fees 
    function compound() external onlyAdvisor returns(
        uint128 baseToken0Owed,
        uint128 baseToken1Owed,
        uint128 limitToken0Owed,
        uint128 limitToken1Owed,
        uint256[4] memory inMin
    ) {
        hypervisor.compound();
    }

    function compound(uint256[4] memory inMin)
      external onlyAdvisor returns(
        uint128 baseToken0Owed,
        uint128 baseToken1Owed,
        uint128 limitToken0Owed,
        uint128 limitToken1Owed
    ) {
        hypervisor.compound(inMin);
    }

    /// @param _address Array of addresses to be appended
    function setWhitelist(address _address) external onlyAdmin {
        hypervisor.setWhitelist(_address);
    }

    function removeWhitelisted() external onlyAdmin {
        hypervisor.removeWhitelisted();
    }

    /// @param newAdmin New Admin Address
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "newAdmin should be non-zero");
        admin = newAdmin;
    }

    /// @param newAdvisor New Advisor Address
    function transferAdvisor(address newAdvisor) external onlyAdmin {
        require(newAdvisor != address(0), "newAdvisor should be non-zero");
        advisor = newAdvisor;
    }

    /// @param newOwner New Owner Address
    function transferHypervisorOwner(address newOwner) external onlyAdmin {
        hypervisor.transferOwnership(newOwner);
    }

    /// @notice Transfer tokens to the recipient from the contract
    /// @param token Address of token
    /// @param recipient Recipient Address
    function rescueERC20(IERC20 token, address recipient) external onlyAdmin {
        require(recipient != address(0), "recipient should be non-zero");
        require(token.transfer(recipient, token.balanceOf(address(this))));
    }

    /// @param newFee fee amount 
    function setFee(uint8 newFee) external onlyAdmin {
        hypervisor.setFee(newFee);
    }

    /// @param _recipient fee recipient 
    function setRecipient(address _recipient) external onlyAdmin {
      feeRecipient = _recipient;
    }

}
