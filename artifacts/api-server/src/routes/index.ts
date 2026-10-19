import { Router, type IRouter } from "express";
import healthRouter from "./health";
import systemRouter from "./system";
import documentsRouter from "./documents";
import risksRouter from "./risks";
import dashboardRouter from "./dashboard";
import actionsRouter from "./actions";
import reassessmentsRouter from "./reassessments";
import playbookRouter from "./playbook";
import authRouter from "./auth";
import assistantRouter from "./assistant";
import { requireAuth, requireCompany } from "../middlewares/auth";

const router: IRouter = Router();

// Public: health check and login. Everything below requires a signed-in user.
router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth);
router.use(systemRouter);
router.use(documentsRouter);
router.use(risksRouter);
router.use(dashboardRouter);
router.use(actionsRouter);
router.use(reassessmentsRouter);
router.use(assistantRouter);
router.use("/playbook", requireCompany);
router.use(playbookRouter);

export default router;
