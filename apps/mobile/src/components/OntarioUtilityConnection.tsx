import {ProviderConnectionCard} from "./ProviderConnectionCard";
/** Opening this explanation never starts a provider retrieval. */
export function OntarioUtilityConnection({onPress}:{onPress:()=>void}) {
 return <ProviderConnectionCard kind="green" onPress={onPress}/>;
}
