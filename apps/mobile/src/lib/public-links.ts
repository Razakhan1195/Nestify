import { Alert, Linking } from "react-native";
export const publicLinks = {contact:"https://rezlee.com/contact",privacy:"https://rezlee.com/privacy",terms:"https://rezlee.com/terms",disclosures:"https://rezlee.com/disclosures",deletion:"https://rezlee.com/delete-account"} as const;
export async function openPublicLink(key:keyof typeof publicLinks) {
 try {await Linking.openURL(publicLinks[key]);}
 catch {Alert.alert("Couldn’t open this page",`Please try again, or open ${publicLinks[key]} in your browser.`);}
}
