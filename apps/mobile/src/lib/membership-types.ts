export type Membership={plan:"free"|"pro";source:string|null;lifetime:boolean;household:boolean;expiresAt:string|null;homeId:string|null;founderSeen:boolean;proWelcomeSeen?:boolean;activated:boolean;founderReason?:"waitlist"|"first_1000"|null;founderSlot?:number|null};
export type MembershipPayload={enabled:boolean;purchasesAvailable:boolean;restoreAvailable?:boolean;storeProductIds?:string[];membership?:Membership};

