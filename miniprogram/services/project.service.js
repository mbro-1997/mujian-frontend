const { request } = require("./http");
const { PROJECT_STATUS, getProjectStatusText } = require("../constants/status");
const { normalizeProp } = require("./prop.service");

function normalizeProject(item) {
  const props = (item.props || []).map(normalizeProp).map((prop) => ({
    ...prop,
    orderable: prop.canRent && Number(prop.quantity || 1) <= Number(prop.availableStock || 0),
  }));
  const unavailableCount = Number(
    item.unavailableCount != null
      ? item.unavailableCount
      : props.filter((prop) => !prop.orderable).length
  );

  return {
    id: Number(item.id),
    name: item.name || "",
    description: item.description || "",
    status: item.status || PROJECT_STATUS.EDITING,
    statusText:
      item.statusText ||
      getProjectStatusText(item.status || PROJECT_STATUS.EDITING),
    unavailableCount,
    canSubmit:
      item.canSubmit != null
        ? !!item.canSubmit
        : (item.status || PROJECT_STATUS.EDITING) === PROJECT_STATUS.EDITING &&
          props.length > 0 &&
          unavailableCount === 0,
    createdAt: item.createdAt || 0,
    updatedAt: item.updatedAt || 0,
    propIds: (item.propIds || []).map((id) => Number(id)),
    props,
  };
}

async function listProjects() {
  const data = await request({ url: "/projects" });
  return (data || []).map(normalizeProject);
}

async function getProjectById(id) {
  const data = await request({ url: `/projects/${id}` });
  return normalizeProject(data);
}

async function createProject(payload) {
  const data = await request({
    url: "/projects",
    method: "POST",
    data: {
      name: payload.name,
      description: payload.description || "",
    },
  });
  return normalizeProject(data);
}

async function updateProject(project) {
  const data = await request({
    url: `/projects/${project.id}`,
    method: "PUT",
    data: {
      name: project.name,
      description: project.description || "",
    },
  });
  return normalizeProject(data);
}

async function addPropToEditingProject(propId, quantity = 1) {
  const data = await request({
    url: "/projects/editing/items",
    method: "POST",
    data: { propId: Number(propId), quantity: Number(quantity || 1) },
  });
  return normalizeProject(data);
}

async function addPropToProject(projectId, propId, quantity = 1) {
  const data = await request({
    url: `/projects/${projectId}/items`,
    method: "POST",
    data: { propId: Number(propId), quantity: Number(quantity || 1) },
  });
  return normalizeProject(data);
}

async function removePropFromProject(projectId, propId) {
  const data = await request({
    url: `/projects/${projectId}/items/${propId}`,
    method: "DELETE",
  });
  return normalizeProject(data);
}

async function updateProjectItemQuantity(projectId, propId, quantity) {
  const data = await request({
    url: `/projects/${projectId}/items/${propId}`,
    method: "PUT",
    data: { propId: Number(propId), quantity: Number(quantity || 1) },
  });
  return normalizeProject(data);
}

async function markProjectOrdered(projectId) {
  return getProjectById(projectId);
}

module.exports = {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  addPropToEditingProject,
  addPropToProject,
  removePropFromProject,
  updateProjectItemQuantity,
  markProjectOrdered,
  normalizeProject,
};
