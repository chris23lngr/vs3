import { fromWebHandler } from "h3";
import { storage } from "../../storage";

export default fromWebHandler(storage.handler);
