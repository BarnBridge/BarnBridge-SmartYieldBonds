// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

interface ITokenSlippageModel {

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
