import { Navigate, useParams } from "react-router-dom";

export const MaterialRollCalculationPage = () => {
  const { tenderId = "" } = useParams();

  return <Navigate replace to={`/tenders/${tenderId}/material-sourcing`} />;
};
