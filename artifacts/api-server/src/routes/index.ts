import { Router, type IRouter } from "express";
import healthRouter from "./health";
import systemRouter from "./system";
import documentsRouter from "./documents";
import risksRouter from "./risks";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(systemRouter);
router.use(documentsRouter);
router.use(risksRouter);
router.use(dashboardRouter);

export default router;
