export type StoreBilling={status:"trial"|"active"|"grace";autoRenew:boolean|null;renewsAt:string|null;periodEndsAt:string;environment:"sandbox"|"production"};
export type Membership={storeBilling?:StoreBilling|null;plan:"free"|"pro";source:string|null;lifetime:boolean;household:boolean;expiresAt:string|null;homeId:string|null;founderSeen:boolean;proWelcomeSeen?:boolean;activated:boolean;founderReason?:"waitlist"|"first_1000"|null;founderSlot?:number|null};
export type MembershipPayload={enabled:boolean;purchasesAvailable:boolean;restoreAvailable?:boolean;storeProductIds?:string[];membership?:Membership};

