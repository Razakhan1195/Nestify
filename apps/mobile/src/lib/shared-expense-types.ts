import type { ExpenseShare } from "./shared-expense-math";

// Data-only contract; server tests must not load native networking or storage.
export type SharedPerson={id:string;name:string;state:"owner"|"member"|"invited"|"local"|"former";self:boolean;guest:boolean;memberId?:string|null;inviteExpired?:boolean};
export type SharedBalance={from:string;to:string;cents:number};
export type ExpenseDetails={title:string;amountCents:number;paidBy:string;shares:ExpenseShare[];happenedOn:string;note:string};
export type RepaymentDetails={from:string;to:string;amountCents:number;happenedOn:string;note:string};
export type SharedEntry={id:string;home_id:string;version:number;voided:boolean;canEdit:boolean;created_at:string;updated_at:string}&(
 {kind:"expense";details:ExpenseDetails}|{kind:"repayment";details:RepaymentDetails});
export type SharedChange={id:number;actor_name:string;action:string;version:number;details:ExpenseDetails|RepaymentDetails|{reason:string;previous:ExpenseDetails|RepaymentDetails};created_at:string};
export type SharedPayload={viewerId?:string;groupId?:string;archived?:boolean;settlementNotices?:boolean;home:{id:string;name:string};role:"owner"|"member";people:SharedPerson[];balances:SharedBalance[];entries:SharedEntry[];changes:SharedChange[];moreChanges:boolean;nextCursor:string|null};
