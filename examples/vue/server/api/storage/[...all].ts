import { toH3Handler } from "vs3/integrations/h3";
import { storage } from "../../storage";

export default toH3Handler(storage.handler);
