// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO:
import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./lib/math/Exponential.sol";
import "./lib/math/SafeMath16.sol";
import "./compound-finance/CTokenInterfaces.sol";

import "./SeniorBondToken.sol";
import "./JuniorPoolToken.sol";

contract SmartYieldPool is ReentrancyGuard, Exponential {
    //using SafeMath16 for uint16;
    using SafeMath for uint256;
    using Counters for Counters.Counter;

    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_DAY = BLOCKS_PER_YEAR / 365;
    uint256 public constant BOND_LIFE_MAX = 365; // in days

    uint256 public feePercent = (10**18 * 1) / 1000; // 0.1%

    // DAI
    IERC20 public underlying;
    // cDAI
    CErc20Interface public cToken;
    // COMP
    IERC20 public rewardCToken;

    struct PoolState {
        uint256 underlyingPrincipal; // amount sent to provider
        uint256 underlyingInBonds; // amount locked in bonds to be paid out
        uint256 underlyingPoolFees; // amount locked in fees
    }

    PoolState public poolState;

    // senior BONDs
    struct SeniorBond {
        uint256 principal;
        uint256 gain;
        uint256 issuedAt;
        uint256 maturesAt;
    }

    SeniorBondToken public seniorBondToken;

    Counters.Counter private _seniorBondIds;

    // bond id => bond (SeniorBond)
    mapping(uint256 => SeniorBond) public seniorBond;

    // senior BONDs

    // junior POOL token
    JuniorPoolToken public juniorToken;

    // junior POOL k
    uint256 juniorTokenK;

    constructor(address _cToken, address _rewardCToken) public {
        cToken = CErc20Interface(_cToken);
        underlying = IERC20(cToken.underlying());
        rewardCToken = IERC20(_rewardCToken);
    }

    function setup(
        address _seniorBondToken,
        address _juniorToken,
        uint256 _underlyingAmount,
        uint256 _jTokenAmount
    ) public {
        // @TODO:
        seniorBondToken = SeniorBondToken(_seniorBondToken);
        juniorToken = JuniorPoolToken(_juniorToken);

        require(
            _underlyingAmount <=
                underlying.allowance(msg.sender, address(this)),
            "SmartYieldPool: setup not enought allowance"
        );

        underlying.transferFrom(msg.sender, address(this), _underlyingAmount);
        underlying.approve(address(cToken), _underlyingAmount);

        require(
            0 == cToken.mint(_underlyingAmount),
            "SmartYieldPool: setup failed to mint cToken"
        );

        juniorToken.mint(msg.sender, _jTokenAmount);

        juniorTokenK = _jTokenAmount.mul(_underlyingAmount);
    }

    /**
     * @notice Purchase a senior bond with principalAmount underlying for forEpochs
     * @dev
     */
    function buyBond(uint256 principalAmount, uint16 forDays)
        public
        nonReentrant
    {
        require(
            principalAmount <= underlying.allowance(msg.sender, address(this)),
            "SmartYieldPool: buyBond not enought allowance"
        );

        underlying.transferFrom(msg.sender, address(this), principalAmount);
        underlying.approve(address(cToken), principalAmount);

        require(
            0 == cToken.mint(principalAmount),
            "SmartYieldPool: buyBond cToken mint failed"
        );

        require(
            0 < forDays && forDays <= BOND_LIFE_MAX,
            "SmartYieldPool: buyBond forDays invalid"
        );

        uint256 ratePerBlock = bondRatePerBlockSlippage(principalAmount);

        mintBond(
            msg.sender,
            principalAmount,
            ratePerBlock,
            block.timestamp,
            forDays
        );
    }

    function redeemBond(uint256 _bondId) public nonReentrant {
        require(
            block.timestamp > seniorBond[_bondId].maturesAt,
            "SmartYieldPool: redeemBond not matured"
        );

        require(
            0 == cToken.redeemUnderlying(seniorBond[_bondId].gain),
            "SmartYieldPool: redeemBond redeemUnderlying failed"
        );

        underlying.transfer(
            seniorBondToken.ownerOf(_bondId),
            seniorBond[_bondId].gain
        );

        poolState.underlyingPrincipal = poolState.underlyingPrincipal.sub(
            seniorBond[_bondId].principal
        );
        poolState.underlyingInBonds = poolState.underlyingInBonds.sub(
            seniorBond[_bondId].gain
        );

        delete seniorBond[_bondId];
        seniorBondToken.burn(_bondId);
    }

    function buyToken(uint256 _underlying, uint256 _minTokens)
        public
        nonReentrant
    {
        uint256 toReceive = getsTokens(_underlying);
        require(
            _minTokens <= toReceive,
            "SmartYieldPool: buyToken min required"
        );

        require(
            _underlying <= underlying.allowance(msg.sender, address(this)),
            "SmartYieldPool: buyToken allowance"
        );

        underlying.transferFrom(msg.sender, address(this), _underlying);
        underlying.approve(address(cToken), _underlying);

        require(
            0 == cToken.mint(_underlying),
            "SmartYieldPool: buyBond cToken mint failed"
        );

        juniorToken.mint(msg.sender, toReceive);
    }

    function sellToken(uint256 _juniorTokens, uint256 _minUnderlying)
        public
        nonReentrant
    {
        uint256 toReceive = getsUnderlying(_juniorTokens);
        require(
            _minUnderlying <= toReceive,
            "SmartYieldPool: sellToken min required"
        );

        require(
            _juniorTokens <= juniorToken.balanceOf(msg.sender),
            "SmartYieldPool: sellToken balance required"
        );

        juniorToken.burn(msg.sender, _juniorTokens);

        require(
            0 == cToken.redeemUnderlying(toReceive),
            "SmartYieldPool: sellToken redeemUnderlying failed"
        );

        underlying.transfer(msg.sender, toReceive);
    }

    // unsafe: does not check liquidity
    function lockFeeFor(uint256 _underlyingFeeable) internal {
        poolState.underlyingPoolFees.add(feeFor(_underlyingFeeable));
    }

    function mintBond(
        address to,
        uint256 principal,
        uint256 ratePerBlock,
        uint256 startingAt,
        uint16 forDays
    ) internal {
        uint256 bondId = _seniorBondIds.current();
        _seniorBondIds.increment();

        uint256 maturesAt = startingAt.add(uint256(1 days).mul(forDays));
        uint256 gain = bondGain(principal, ratePerBlock, forDays);
        uint256 fee = feeFor(principal);

        require(
            gain.sub(principal).add(fee) <=
                underlyingLiquidity().add(underlyingLiquidityBuffer())
        );
        lockFeeFor(principal);

        seniorBond[bondId] = SeniorBond(principal, gain, startingAt, maturesAt);

        poolState.underlyingPrincipal = poolState.underlyingPrincipal.add(
            principal
        );
        poolState.underlyingInBonds = poolState.underlyingInBonds.add(gain);

        seniorBondToken.mint(to, bondId);
    }

    function feeFor(uint256 _underlyingFeeable) public view returns (uint256) {
        return _underlyingFeeable.mul(feePercent).div(10**18);
    }

    function bondGain(
        uint256 principalAmount,
        uint256 ratePerBlock,
        uint16 forDays
    ) public pure returns (uint256) {
        uint256 ratePerEpoch = ratePerBlock * BLOCKS_PER_DAY;
        return compound(principalAmount, ratePerEpoch, forDays);
    }

    /**
     * @notice computes the bondRate per block takeing into account the slippage
     * @return (the bondRate after slippage)
     */
    function bondRatePerBlockSlippage(uint256 addedPrincipalAmount)
        public
        view
        returns (uint256)
    {
        // @TODO: formula + COPM valuation
        return cToken.supplyRatePerBlock();
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() public view returns (uint256) {
        return
            cToken
                .balanceOf(address(this))
                .mul(cToken.exchangeRateStored())
                .div(10**18);
    }

    /**
     * @notice current underlying liquidity, without accruing interest
     */
    function underlyingLiquidity() public view returns (uint256) {
        return
            underlyingTotal() -
            poolState.underlyingInBonds -
            poolState.underlyingPoolFees;
    }

    function underlyingLiquidityBuffer() public pure returns (uint256) {
        return 0;
    }

    function claimTokenTotal() public view returns (uint256) {
        return cToken.balanceOf(address(this));
    }

    function compound(
        uint256 _principal,
        uint256 _ratePerDay,
        uint16 _days
    ) public pure returns (uint256) {
        // from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
        _days -= 1;
        while (_days > 0) {
            _principal += (_principal * _ratePerDay) / 10**18;
            _days -= 1;
        }
        return _principal;
    }

    function getsTokens(uint256 _underlyingAmount)
        public
        view
        returns (uint256)
    {
        return
            juniorTokenK.div(underlyingLiquidity().add(_underlyingAmount)).sub(
                juniorToken.totalSupply()
            );
    }

    function getsUnderlying(uint256 _juniorTokenAmount)
        public
        view
        returns (uint256)
    {
        return
            juniorTokenK
                .div(juniorToken.totalSupply().add(_juniorTokenAmount))
                .sub(underlyingLiquidity());
    }
}
