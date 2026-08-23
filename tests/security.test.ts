import { describe,expect,it } from "vitest";
import { isPrivateAddress } from "@/lib/source/security";

describe("SSRF address protection",()=>{
  it.each(["127.0.0.1","10.0.0.4","172.16.1.2","172.31.255.255","192.168.1.1","169.254.169.254","::1","fc00::1","fe80::1"])("blocks %s",(address)=>expect(isPrivateAddress(address)).toBe(true));
  it.each(["1.1.1.1","8.8.8.8","2606:4700:4700::1111"])("allows public address %s",(address)=>expect(isPrivateAddress(address)).toBe(false));
});
