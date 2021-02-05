// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./ASmartYieldPool.sol";

abstract contract ASmartYieldPoolViews is
    ASmartYieldPool
{
    function abond()
      public view override
      returns(uint256 principal, uint256 gain, uint256 issuedAt, uint256 maturesAt, bool liquidated)
    {
        return (
          st.abond.principal,
          st.abond.gain,
          st.abond.issuedAt,
          st.abond.maturesAt,
          st.abond.liquidated
        );
    }

    function seniorBonds(uint256 id)
      public view override
      returns(uint256 principal, uint256 gain, uint256 issuedAt, uint256 maturesAt, bool liquidated)
    {
        return (
          st.seniorBonds[id].principal,
          st.seniorBonds[id].gain,
          st.seniorBonds[id].issuedAt,
          st.seniorBonds[id].maturesAt,
          st.seniorBonds[id].liquidated
        );
    }


    function juniorBonds(uint256 id_)
      public view override
    returns(uint256 tokens, uint256 maturesAt)
    {
      return (st.juniorBonds[id_].tokens, st.juniorBonds[id_].maturesAt);
    }

    function juniorBondsMaturities() public view returns (uint256[] memory) {
      return st.juniorBondsMaturities;
    }


}
