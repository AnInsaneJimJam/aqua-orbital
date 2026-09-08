import {configDTOSchema,orderDTOSchema,type ConfigDTO,type OrderDTO} from '@orbital/shared';
import {validateConfig,type Config,type Order} from './codec';
import type {Address,Hex} from 'viem';

export function configToDTO(config:Config):ConfigDTO {
 validateConfig(config);
 return configDTOSchema.parse({...config,chainId:config.chainId.toString(),makerNonce:config.makerNonce.toString(),tickKeys:config.tickKeys.map(String),radiiInternal:config.radiiInternal.map(String),initialAmountsRaw:config.initialAmountsRaw.map(String)});
}
export function configFromDTO(value:unknown):Config {
 const dto=configDTOSchema.parse(value);
 const config:Config={...dto,router:dto.router as Address,maker:dto.maker as Address,tokens:dto.tokens as Address[],chainId:BigInt(dto.chainId),makerNonce:BigInt(dto.makerNonce),tickKeys:dto.tickKeys.map(BigInt),radiiInternal:dto.radiiInternal.map(BigInt),initialAmountsRaw:dto.initialAmountsRaw.map(BigInt)};
 validateConfig(config); return config;
}
export function orderToDTO(order:Order):OrderDTO {return orderDTOSchema.parse({...order,traits:order.traits.toString()});}
export function orderFromDTO(value:unknown):Order {
 const dto=orderDTOSchema.parse(value);
 return {maker:dto.maker as Address,traits:BigInt(dto.traits),data:dto.data as Hex};
}
