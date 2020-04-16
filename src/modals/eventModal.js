import { eventInjectionModal } from "./eventInjectionModal";
import { generateFieldWithTitle } from "../components/fieldWithTitle";

function updateEvent(api, registry, schema) {
  return api
    .describeSchema({ RegistryName: registry, SchemaName: schema })
    .promise();
}

function handleAWSEvent(eventJson, event) {
  // Update detailType and source fields from schema
  const detailType =
    eventJson.components.schemas.AWSEvent["x-amazon-events-detail-type"];
  const source =
    eventJson.components.schemas.AWSEvent["x-amazon-events-source"];
  event.DetailType = detailType;
  event.Source = source;

  // "detail" is contained in the AWSEvent schema as a reference,
  // typically of the form #/components/schemas/TestEvent
  const eventDetail =
    eventJson.components.schemas.AWSEvent.properties.detail.$ref;
  //  Convert reference to an array of properties, to create a path to "detail"
  const pathToDetail = eventDetail.replace("#/", "").split("/");
  // Updated eventJson to the "detail" field stored at the end of the path
  pathToDetail.forEach((parsed) => (eventJson = eventJson[parsed]));

  if (Object.prototype.hasOwnProperty.call(eventJson, "required")) {
    return eventJson.required;
  }
  return [];
}

function handleCustomEvent(eventJson) {
  if (
    Object.prototype.hasOwnProperty.call(
      eventJson.components.schemas.Event,
      "required"
    )
  ) {
    return eventJson.components.schemas.Event.required;
  }
  const { properties } = eventJson.components.schemas.Event;
  return Object.keys(properties);
}

async function getProperties(api, registry, schema, event) {
  const data = await updateEvent(api, registry, schema);
  const parsedEvent = JSON.parse(data.Content);

  if (
    Object.prototype.hasOwnProperty.call(
      parsedEvent.components.schemas,
      "AWSEvent"
    )
  ) {
    return handleAWSEvent(parsedEvent, event);
  }
  return handleCustomEvent(parsedEvent);
}

const createDynamicForm = async (
  blessed,
  api,
  parent,
  closeModal,
  modalState
) => {
  let fieldList = [];
  fieldList = await getProperties(
    api,
    modalState.registry,
    modalState.schema,
    modalState.event
  );

  if (fieldList.length > 5) {
    blessed.box({
      parent,
      width: 106,
      height: 4,
      left: "right",
      top: "center",
      align: "center",
      padding: { left: 2, right: 2 },
      border: "line",
      style: { fg: "green", border: { fg: "green" } },
      content:
        "The tool currently can't display more than 5 fields.\nComing in the next version!",
    });
  } else if (fieldList !== []) {
    fieldList.forEach((field) => {
      const textbox = generateFieldWithTitle(blessed, parent, field, "", 106);
      textbox.on("cancel", () => {
        closeModal();
      });
      modalState.textboxes.push(textbox);
      modalState.fieldNames.push(field);
    });
  }
};

const createDetail = (keys, textboxes) => {
  try {
    const values = [];
    textboxes.forEach((textbox) => values.push(textbox.getValue()));
    const detail = {};
    for (let i = 0; i < keys.length; i += 1) {
      detail[keys[i]] = values[i];
    }
    return detail;
  } catch (e) {
    console.log(e);
  }
};

const eventModal = (
  screen,
  blessed,
  eventBridge,
  application,
  api,
  registry,
  schema,
  injectEvent
) => {
  const eventLayout = blessed.layout({
    parent: screen,
    top: "center",
    left: "center",
    width: 112,
    height: 33,
    border: "line",
    style: { border: { fg: "green" } },
    keys: true,
    grabKeys: true,
  });

  const closeModal = () => {
    // Store all text to populate modal when next opened
    application.setIsModalOpen(false);
    application.returnFocus();
    eventLayout.destroy();
  };

  const modalState = {
    currentTextbox: 0,
    textboxes: [],
    fieldNames: [],
    registry,
    schema,
    event: {
      EventBusName: eventBridge,
      DetailType: "",
      Source: "",
      Detail: "{}",
    },
  };

  const unselectTextbox = (index) => {
    modalState.textboxes[index].style.border.fg = "green";
    // If textbox is the submit button
    if (index === 0) {
      modalState.textboxes[index].style.fg = "green";
    }
  };

  const selectTextbox = (index) => {
    modalState.textboxes[index].style.border.fg = "yellow";
    // If textbox is the submit button
    if (index === 0) {
      modalState.textboxes[index].style.fg = "yellow";
    }
  };

  blessed.box({
    parent: eventLayout,
    width: 110,
    left: "right",
    top: "center",
    align: "center",
    padding: { left: 2, right: 2 },
    style: { fg: "green" },
    content: `Event Injection - ${schema}`,
  });

  const fieldLayout = blessed.layout({
    parent: eventLayout,
    top: "center",
    left: "center",
    width: 110,
    height: 22,
    border: "line",
    style: { border: { fg: "green" } },
    keys: true,
    grabKeys: true,
  });

  const submit = blessed.box({
    parent: eventLayout,
    width: 110,
    height: 4,
    left: "right",
    top: "center",
    align: "center",
    padding: { left: 2, right: 2 },
    border: "line",
    style: { fg: "yellow", border: { fg: "yellow" } },
    content: "Submit",
  });

  // Push submit to front of textboxes array to avoid race conditions
  modalState.textboxes.push(submit);

  createDynamicForm(blessed, api, fieldLayout, closeModal, modalState);

  blessed.box({
    parent: eventLayout,
    width: 110,
    height: 4,
    left: "right",
    top: "center",
    align: "center",
    padding: { left: 2, right: 2 },
    border: "line",
    style: { fg: "green", border: { fg: "green" } },
    content:
      "Arrow keys to select field | ENTER to toggle edit mode \nENTER on Submit to inject event | ESC to close",
  });

  fieldLayout.focus();

  fieldLayout.key(["enter"], () => {
    // If submit button is in focus
    try {
      if (modalState.currentTextbox === 0) {
        // Slice textboxes to ignore submit button
        const detail = JSON.stringify(
          createDetail(modalState.fieldNames, modalState.textboxes.slice(1))
        );
        modalState.event.Detail = detail;
        eventLayout.destroy();
        eventInjectionModal(
          screen,
          blessed,
          eventBridge,
          application,
          injectEvent,
          modalState.event
        );
      } else {
        // Edit field
        modalState.textboxes[modalState.currentTextbox].focus();
      }
    } catch (e) {
      console.log(e);
    }
  });
  fieldLayout.key(["up"], () => {
    unselectTextbox(modalState.currentTextbox);
    modalState.currentTextbox -= 1;
    if (modalState.currentTextbox === -1) {
      modalState.currentTextbox = modalState.textboxes.length - 1;
    }
    selectTextbox(modalState.currentTextbox);
  });
  fieldLayout.key(["down"], () => {
    unselectTextbox(modalState.currentTextbox);
    modalState.currentTextbox += 1;
    if (modalState.currentTextbox === modalState.textboxes.length) {
      modalState.currentTextbox = 0;
    }
    selectTextbox(modalState.currentTextbox);
  });

  fieldLayout.key(["escape"], () => {
    // Discard modal
    closeModal();
  });
};

module.exports = {
  eventModal,
};
